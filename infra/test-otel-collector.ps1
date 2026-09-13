param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $repoRoot "infra/otel-collector.production.yaml"
$dashboardPath = Join-Path $repoRoot "infra/grafana/ysheng-vps-host-dashboard.json"
$hostMetricsTestConfigPath = Join-Path $repoRoot "infra/testing/otel-hostmetrics-test.yaml"
$traceProtoPath = Join-Path $repoRoot "infra/testing/otlp-trace-test.proto"
$image = "otel/opentelemetry-collector-contrib:0.160.0@sha256:5b66b0dc6921f2a439cf50b942ccb9e2a4375f136239a9fdf709ef33e4bfc668"
$healthImage = "curlimages/curl:8.16.0@sha256:463eaf6072688fe96ac64fa623fe73e1dbe25d8ad6c34404a669ad3ce1f104b6"
$grpcurlImage = "fullstorydev/grpcurl:v1.9.3-alpine@sha256:4614424ed58e9b9837c48b6b8eadb9ef40491d5af3499bcc8b378e9c64a9e4a9"

if (-not (Test-Path -LiteralPath $configPath)) {
  throw "Production OpenTelemetry Collector configuration is missing."
}

if (-not (Test-Path -LiteralPath $dashboardPath)) {
  throw "Grafana host dashboard is missing."
}
$dashboard = Get-Content -LiteralPath $dashboardPath -Raw | ConvertFrom-Json
if ($dashboard.uid -ne "ysheng-vps-host" -or $dashboard.panels.Count -lt 5) {
  throw "Grafana host dashboard must provide the stable host UID and all five host-health panels."
}
$dashboardText = Get-Content -LiteralPath $dashboardPath -Raw
foreach ($metric in @("system_cpu_utilization_ratio", "system_memory_utilization_ratio", "system_filesystem_utilization_ratio", "system_disk_io_time_seconds_total", "system_network_io_bytes_total")) {
  if (-not $dashboardText.Contains($metric)) { throw "Grafana host dashboard is missing metric: $metric" }
}

$text = Get-Content -LiteralPath $configPath -Raw
foreach ($expected in @(
  "basicauth/grafana_cloud:",
  "bearertokenauth/ingest:",
  "health_check:",
  "memory_limiter:",
  "resource/production:",
  "prometheus/collector:",
  "host_metrics:",
  "root_path: /hostfs",
  'mount_points: ["/"]',
  'devices: ["^(sd|vd|xvd|nvme).*$"]',
  'interfaces: ["^(eth|ens|enp)[0-9a-z]+$"]',
  "exclude_fs_types:",
  "resource/host:",
  "value: ysheng-vps-host",
  "deployment.environment.name",
  "service.namespace",
  "otlp/aspire:",
  "otlphttp/grafana_cloud:",
  '${env:ASPIRE_DASHBOARD_OTLP_API_KEY}',
  '${env:OTEL_COLLECTOR_INGEST_TOKEN}',
  '${env:GRAFANA_CLOUD_OTLP_ENDPOINT}',
  '${env:GRAFANA_CLOUD_OTLP_INSTANCE_ID}',
  '${env:GRAFANA_CLOUD_OTLP_API_TOKEN}',
  "sending_queue:",
  "retry_on_failure:",
  "logs:",
  "metrics:",
  "metrics/host:",
  "receivers: [host_metrics]",
  "traces:",
  "exporters: [otlp/aspire, otlphttp/grafana_cloud]"
)) {
  if (-not $text.Contains($expected)) {
    throw "Collector configuration is missing expected text: $expected"
  }
}

if ($IsLinux) {
  $hostMetricsContainer = "ysheng-hostmetrics-test-$([Guid]::NewGuid().ToString('N'))"
  try {
    & docker run --rm -d --name $hostMetricsContainer `
      -v "/:/hostfs:ro" `
      -v "${hostMetricsTestConfigPath}:/etc/otelcol-contrib/config.yaml:ro" `
      $image --config=/etc/otelcol-contrib/config.yaml | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Host metrics runtime test could not start." }
    Start-Sleep -Seconds 4
    $hostMetricsLogs = (& docker logs $hostMetricsContainer 2>&1) -join "`n"
    if ($hostMetricsLogs -match "Error scraping metrics") { throw "Host metrics runtime reported a scraper failure.`n$hostMetricsLogs" }
    foreach ($metric in @("system.cpu.utilization", "system.memory.utilization", "system.filesystem.utilization", "system.disk.io_time", "system.network.io")) {
      if (-not $hostMetricsLogs.Contains($metric)) { throw "Host metrics runtime did not emit: $metric" }
    }
  }
  finally {
    & docker rm -f $hostMetricsContainer 2>$null | Out-Null
  }
}
foreach ($forbidden in @("process:", "processes:", "docker_stats:", "k8s_cluster:")) {
  if ($text.Contains($forbidden)) {
    throw "Collector host telemetry includes a forbidden high-cardinality receiver or scraper: $forbidden"
  }
}

& docker run --rm `
  -e ASPIRE_DASHBOARD_OTLP_API_KEY=test-dashboard-key `
  -e OTEL_COLLECTOR_INGEST_TOKEN=test-collector-ingest-token `
  -e GRAFANA_CLOUD_OTLP_ENDPOINT=https://otlp-gateway-prod-test.grafana.net/otlp `
  -e GRAFANA_CLOUD_OTLP_INSTANCE_ID=123456 `
  -e GRAFANA_CLOUD_OTLP_API_TOKEN=test-grafana-token `
  -v "${repoRoot}:/hostfs:ro" `
  -v "${configPath}:/etc/otelcol-contrib/config.yaml:ro" `
  $image validate --config=/etc/otelcol-contrib/config.yaml
if ($LASTEXITCODE -ne 0) {
  throw "OpenTelemetry Collector rejected the production configuration."
}

$containerName = "ysheng-otel-outage-test-$([Guid]::NewGuid().ToString('N'))"
try {
  & docker run --rm -d --name $containerName --network none `
    -e ASPIRE_DASHBOARD_OTLP_API_KEY=test-dashboard-key `
    -e OTEL_COLLECTOR_INGEST_TOKEN=test-collector-ingest-token `
    -e GRAFANA_CLOUD_OTLP_ENDPOINT=https://otlp-gateway-prod-test.grafana.net/otlp `
    -e GRAFANA_CLOUD_OTLP_INSTANCE_ID=123456 `
    -e GRAFANA_CLOUD_OTLP_API_TOKEN=test-grafana-token `
    -v "${repoRoot}:/hostfs:ro" `
    -v "${configPath}:/etc/otelcol-contrib/config.yaml:ro" `
    $image --config=/etc/otelcol-contrib/config.yaml | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "OpenTelemetry Collector could not start with its exporters unavailable."
  }
  Start-Sleep -Seconds 3
  $running = & docker inspect --format '{{.State.Running}}' $containerName
  if ($LASTEXITCODE -ne 0 -or $running.Trim() -ne "true") {
    throw "OpenTelemetry Collector stopped when its exporters were unavailable."
  }
}
finally {
  & docker rm -f $containerName 2>$null | Out-Null
}

$healthNetwork = "ysheng-otel-health-$([Guid]::NewGuid().ToString('N'))"
$healthContainer = "ysheng-otel-health-target-$([Guid]::NewGuid().ToString('N'))"
try {
  & docker network create --internal $healthNetwork | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create the isolated Collector health-test network."
  }
  & docker run --rm -d --name $healthContainer --network $healthNetwork `
    -e ASPIRE_DASHBOARD_OTLP_API_KEY=test-dashboard-key `
    -e OTEL_COLLECTOR_INGEST_TOKEN=test-collector-ingest-token `
    -e GRAFANA_CLOUD_OTLP_ENDPOINT=https://otlp-gateway-prod-test.grafana.net/otlp `
    -e GRAFANA_CLOUD_OTLP_INSTANCE_ID=123456 `
    -e GRAFANA_CLOUD_OTLP_API_TOKEN=test-grafana-token `
    -v "${repoRoot}:/hostfs:ro" `
    -v "${configPath}:/etc/otelcol-contrib/config.yaml:ro" `
    $image --config=/etc/otelcol-contrib/config.yaml | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "OpenTelemetry Collector could not start for its runtime health probe."
  }

  $healthy = $false
  foreach ($attempt in 1..10) {
    & docker run --rm --network $healthNetwork $healthImage --fail --silent "http://${healthContainer}:13133/" | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $healthy = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $healthy) {
    throw "Collector health_check extension did not become reachable on the isolated network."
  }

  $unauthenticatedOutput = & docker run --rm --network $healthNetwork `
    -v "${traceProtoPath}:/work/otlp-trace-test.proto:ro" `
    $grpcurlImage -plaintext -import-path /work -proto otlp-trace-test.proto -d '{}' `
    "${healthContainer}:4317" opentelemetry.proto.collector.trace.v1.TraceService/Export 2>&1
  if ($LASTEXITCODE -eq 0 -or ($unauthenticatedOutput -join " ") -notmatch "Unauthenticated") {
    throw "Collector OTLP ingest accepted a request without its bearer token."
  }

  & docker run --rm --network $healthNetwork `
    -v "${traceProtoPath}:/work/otlp-trace-test.proto:ro" `
    $grpcurlImage -plaintext -H "Authorization: Bearer test-collector-ingest-token" `
    -import-path /work -proto otlp-trace-test.proto -d '{}' `
    "${healthContainer}:4317" opentelemetry.proto.collector.trace.v1.TraceService/Export | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Collector OTLP ingest rejected a request with its bearer token."
  }
}
finally {
  & docker rm -f $healthContainer 2>$null | Out-Null
  & docker network rm $healthNetwork 2>$null | Out-Null
}

Write-Host "OpenTelemetry Collector production configuration passed."
