param(
  [string]$ComposeFile = "infra/aspire-output/docker-compose.yaml"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$composePath = if ([System.IO.Path]::IsPathRooted($ComposeFile)) {
  $ComposeFile
}
else {
  Join-Path $repoRoot $ComposeFile
}
$overridePath = Join-Path $repoRoot "infra/docker-compose.aspire.production.yml"
$projectDirectory = Join-Path $repoRoot "infra"

if (-not (Test-Path -LiteralPath $composePath)) {
  throw "Aspire Compose artifact is missing: $composePath"
}
if (-not (Test-Path -LiteralPath $overridePath)) {
  throw "Aspire production Compose override is missing: $overridePath"
}

function Assert-Equal {
  param(
    [string]$Name,
    [string]$Actual,
    [string]$Expected
  )

  if ($Actual -ne $Expected) {
    throw "$Name was '$Actual' instead of '$Expected'."
  }
}

$testEnvironment = [ordered]@{
  POSTGRES_USER = "ysheng"
  POSTGRES_PASSWORD = "test-postgres-password"
  SEED_DATA_ENABLED = "false"
  SEED_ADMIN_EMAIL = "admin@yshenghub.com.my"
  SEED_ADMIN_PASSWORD = "test-admin-password"
  FRONTOFFICE_ORIGIN = "https://ysheng.com.my"
  BACKOFFICE_ORIGIN = "https://yshenghub.com.my"
  PUBLIC_API_BASE_URL = "https://yshenghub.com.my"
  FRONTOFFICE_DOMAIN = "ysheng.com.my"
  BACKOFFICE_DOMAIN = "yshenghub.com.my"
  API_DOMAIN = "yshenghub.com.my"
  TLS_EMAIL = "admin@yshenghub.com.my"
  ASPIRE_DASHBOARD_BROWSER_TOKEN = "test-dashboard-browser-token-with-32-characters"
  ASPIRE_DASHBOARD_OTLP_API_KEY = "test-dashboard-otlp-key-with-32-characters"
  OTEL_COLLECTOR_INGEST_TOKEN = "test-collector-ingest-token-with-32-characters"
  GRAFANA_CLOUD_OTLP_ENDPOINT = "https://otlp-gateway-prod-test.grafana.net/otlp"
  GRAFANA_CLOUD_OTLP_INSTANCE_ID = "123456"
  GRAFANA_CLOUD_OTLP_API_TOKEN = "test-grafana-cloud-token-with-32-characters"
  WHATSAPP_ASSISTANT_ENABLED = "false"
  WHATSAPP_ASSISTANT_WEBHOOK_ENABLED = "false"
  WHATSAPP_ASSISTANT_TEST_MODE = "true"
  WHATSAPP_ASSISTANT_TEST_RECIPIENT = "60199999999"
  WHATSAPP_ASSISTANT_PHONE_NUMBER_ID = "123"
  WHATSAPP_ASSISTANT_BUSINESS_ACCOUNT_ID = "456"
  WHATSAPP_ASSISTANT_GRAPH_API_VERSION = "v25.0"
  WHATSAPP_ASSISTANT_ACCESS_TOKEN = "synthetic-whatsapp-token"
  WHATSAPP_ASSISTANT_APP_SECRET = "synthetic-app-secret-with-32-characters"
  WHATSAPP_ASSISTANT_VERIFY_TOKEN = "synthetic-verify-token-with-32-characters"
  WHATSAPP_ASSISTANT_PER_STAFF_DAILY_LIMIT = "2"
  WHATSAPP_ASSISTANT_WORKSPACE_DAILY_LIMIT = "5"
  WHATSAPP_SENDER_APPROVAL_EVIDENCE = "synthetic-sender-approval"
  WHATSAPP_BUDGET_OWNER = "synthetic-budget-owner"
  WHATSAPP_DAILY_ATTEMPT_LIMIT = "10"
  WHATSAPP_MONTHLY_BUDGET_SEN = "1000"
  WHATSAPP_MAXIMUM_COST_PER_ATTEMPT_SEN = "10"
  WHATSAPP_INVITE_MS_TEMPLATE_NAME = "synthetic_invite_ms"
  WHATSAPP_INVITE_MS_TEMPLATE_APPROVAL_EVIDENCE = "synthetic-invite-ms-approval"
  WHATSAPP_INVITE_EN_TEMPLATE_NAME = "synthetic_invite_en"
  WHATSAPP_INVITE_EN_TEMPLATE_APPROVAL_EVIDENCE = "synthetic-invite-en-approval"
  WHATSAPP_NOTICE_MS_TEMPLATE_NAME = "synthetic_notice_ms"
  WHATSAPP_NOTICE_MS_TEMPLATE_APPROVAL_EVIDENCE = "synthetic-notice-ms-approval"
  WHATSAPP_NOTICE_EN_TEMPLATE_NAME = "synthetic_notice_en"
  WHATSAPP_NOTICE_EN_TEMPLATE_APPROVAL_EVIDENCE = "synthetic-notice-en-approval"
  API_IMAGE = "ysheng-api:test"
  WORKER_IMAGE = "ysheng-worker:test"
  FRONTOFFICE_IMAGE = "ysheng-frontoffice:test"
  BACKOFFICE_IMAGE = "ysheng-backoffice:test"
  GOOGLE_DOCUMENT_AI_PROJECT_ID = "ysheng-test"
  GOOGLE_DOCUMENT_AI_LOCATION = "asia-southeast1"
  GOOGLE_DOCUMENT_AI_DEFAULT_PROCESSOR_ID = "test-ocr-processor"
  GOOGLE_APPLICATION_CREDENTIALS_HOST_PATH = "/tmp/google-document-ai.json"
}

$originalEnvironment = @{}
foreach ($entry in $testEnvironment.GetEnumerator()) {
  $originalEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, "Process")
  [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
}

try {
  $configOutput = & docker compose --project-directory $projectDirectory -f $composePath -f $overridePath config --format json 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose could not merge the Aspire production artifact."
  }

  $compose = $configOutput | ConvertFrom-Json
  $dashboard = $compose.services.'production-dashboard'
  if ($null -eq $dashboard) {
    throw "Merged Compose configuration is missing production-dashboard."
  }
  $opsProxy = $compose.services.'ops-proxy'
  if ($null -eq $opsProxy) {
    throw "Merged Compose configuration is missing ops-proxy."
  }
  $collector = $compose.services.'otel-collector'
  if ($null -eq $collector) {
    throw "Merged Compose configuration is missing otel-collector."
  }
  $collectorHealth = $compose.services.'otel-collector-health'
  if ($null -eq $collectorHealth) {
    throw "Merged Compose configuration is missing the Collector runtime health probe."
  }
  if ($null -ne $dashboard.ports) {
    throw "Aspire dashboard must not publish a host port."
  }
  if ($null -ne $opsProxy.ports) {
    throw "The internal /ops proxy must not publish a host port."
  }
  if ($null -ne $collector.ports) {
    throw "The OTLP collector must not publish a host port."
  }
  if ($null -ne $collectorHealth.ports) {
    throw "The Collector runtime health probe must not publish a host port."
  }
  $navigationAdapterVolume = @($opsProxy.volumes | Where-Object { $_.target -eq "/usr/share/nginx/html/ops-subpath-navigation.js" })
  if ($navigationAdapterVolume.Count -ne 1 -or -not $navigationAdapterVolume[0].read_only) {
    throw "The internal /ops proxy must mount the subpath navigation adapter read-only."
  }
  if ($compose.services.caddy.ports.Count -ne 3) {
    throw "Caddy must be the only public ingress service."
  }

  Assert-Equal -Name "Dashboard image" -Actual $dashboard.image -Expected "mcr.microsoft.com/dotnet/aspire-dashboard:13.4.2@sha256:583b33ffe6cf016115bb55dee00d682ab388832eeb6dd55b6df137e8cae1c1ab"
  Assert-Equal -Name "Dashboard frontend endpoint" -Actual $dashboard.environment.ASPNETCORE_URLS -Expected "http://+:18888"
  Assert-Equal -Name "Dashboard OTLP gRPC endpoint" -Actual $dashboard.environment.ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL -Expected "http://+:18889"
  Assert-Equal -Name "Dashboard ASP.NET Core forwarded headers" -Actual $dashboard.environment.ASPNETCORE_FORWARDEDHEADERS_ENABLED -Expected "true"
  Assert-Equal -Name "Dashboard forwarded headers" -Actual $dashboard.environment.ASPIRE_DASHBOARD_FORWARDEDHEADERS_ENABLED -Expected "true"
  Assert-Equal -Name "Dashboard frontend auth mode" -Actual $dashboard.environment.DASHBOARD__FRONTEND__AUTHMODE -Expected "BrowserToken"
  Assert-Equal -Name "Dashboard public URL" -Actual $dashboard.environment.DASHBOARD__FRONTEND__PUBLICURL -Expected "https://yshenghub.com.my/ops"
  Assert-Equal -Name "Dashboard OTLP auth mode" -Actual $dashboard.environment.DASHBOARD__OTLP__AUTHMODE -Expected "ApiKey"
  Assert-Equal -Name "Dashboard Telemetry HTTP API" -Actual $dashboard.environment.ASPIRE_DASHBOARD_API_DISABLED -Expected "true"
  Assert-Equal -Name "Internal /ops proxy image" -Actual $opsProxy.image -Expected "nginx:1.27.5-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10"
  Assert-Equal -Name "API OTLP service name" -Actual $compose.services.api.environment.OTEL_SERVICE_NAME -Expected "ysheng-api"
  Assert-Equal -Name "Staff assistant enablement" -Actual $compose.services.api.environment.WhatsAppAssistant__Enabled -Expected "false"
  Assert-Equal -Name "Staff callback enablement" -Actual $compose.services.api.environment.WhatsAppAssistant__WebhookEnabled -Expected "false"
  Assert-Equal -Name "Staff assistant test fence" -Actual $compose.services.api.environment.WhatsAppAssistant__TestMode -Expected "true"
  Assert-Equal -Name "Staff assistant test recipient" -Actual $compose.services.api.environment.WhatsAppAssistant__TestRecipient -Expected "60199999999"
  Assert-Equal -Name "Staff assistant sender" -Actual $compose.services.api.environment.WhatsAppAssistant__PhoneNumberId -Expected "123"
  Assert-Equal -Name "Staff assistant business account" -Actual $compose.services.api.environment.WhatsAppAssistant__BusinessAccountId -Expected "456"
  Assert-Equal -Name "Staff assistant graph version" -Actual $compose.services.api.environment.WhatsAppAssistant__GraphApiVersion -Expected "v25.0"
  Assert-Equal -Name "Staff assistant access token" -Actual $compose.services.api.environment.WhatsAppAssistant__AccessToken -Expected "synthetic-whatsapp-token"
  Assert-Equal -Name "Staff assistant signature secret" -Actual $compose.services.api.environment.WhatsAppAssistant__AppSecret -Expected "synthetic-app-secret-with-32-characters"
  Assert-Equal -Name "Staff assistant challenge token" -Actual $compose.services.api.environment.WhatsAppAssistant__VerifyToken -Expected "synthetic-verify-token-with-32-characters"
  Assert-Equal -Name "Staff assistant staff quota" -Actual $compose.services.api.environment.WhatsAppAssistant__PerStaffDailyLimit -Expected "2"
  Assert-Equal -Name "Staff assistant workspace quota" -Actual $compose.services.api.environment.WhatsAppAssistant__WorkspaceDailyLimit -Expected "5"
  $whatsApp = $compose.services.api.environment
  foreach ($setting in @("CaptureEnabled", "SendingEnabled", "StaffCaptureEnabled", "StaffSendingEnabled", "InvitationEnabled", "WebhookEnabled", "SenderApproved", "CostCeilingConfirmed")) {
    Assert-Equal -Name "WhatsApp $setting default-off gate" -Actual $whatsApp."WhatsApp__$setting" -Expected "false"
  }
  Assert-Equal -Name "Shared sender" -Actual $whatsApp.WhatsApp__PhoneNumberId -Expected $compose.services.api.environment.WhatsAppAssistant__PhoneNumberId
  Assert-Equal -Name "Shared business account" -Actual $whatsApp.WhatsApp__BusinessAccountId -Expected $compose.services.api.environment.WhatsAppAssistant__BusinessAccountId
  Assert-Equal -Name "Shared Graph version" -Actual $whatsApp.WhatsApp__GraphApiVersion -Expected $compose.services.api.environment.WhatsAppAssistant__GraphApiVersion
  Assert-Equal -Name "Shared access token" -Actual $whatsApp.WhatsApp__AccessToken -Expected $compose.services.api.environment.WhatsAppAssistant__AccessToken
  Assert-Equal -Name "Shared signature secret" -Actual $whatsApp.WhatsApp__AppSecret -Expected $compose.services.api.environment.WhatsAppAssistant__AppSecret
  Assert-Equal -Name "Shared challenge token" -Actual $whatsApp.WhatsApp__VerifyToken -Expected $compose.services.api.environment.WhatsAppAssistant__VerifyToken
  Assert-Equal -Name "Sender approval evidence" -Actual $whatsApp.WhatsApp__SenderApprovalEvidence -Expected "synthetic-sender-approval"
  Assert-Equal -Name "Budget owner" -Actual $whatsApp.WhatsApp__BudgetOwner -Expected "synthetic-budget-owner"
  Assert-Equal -Name "Daily attempt limit" -Actual $whatsApp.WhatsApp__DailyAttemptLimit -Expected "10"
  Assert-Equal -Name "Monthly budget" -Actual $whatsApp.WhatsApp__MonthlyBudgetSen -Expected "1000"
  Assert-Equal -Name "Maximum cost per attempt" -Actual $whatsApp.WhatsApp__MaximumCostPerAttemptSen -Expected "10"
  foreach ($template in @(
    @{ Index = 0; Key = "staff_invite_v1"; Language = "ms"; Name = "synthetic_invite_ms"; Evidence = "synthetic-invite-ms-approval" },
    @{ Index = 1; Key = "staff_invite_v1"; Language = "en_US"; Name = "synthetic_invite_en"; Evidence = "synthetic-invite-en-approval" },
    @{ Index = 2; Key = "staff_notice_v1"; Language = "ms"; Name = "synthetic_notice_ms"; Evidence = "synthetic-notice-ms-approval" },
    @{ Index = 3; Key = "staff_notice_v1"; Language = "en_US"; Name = "synthetic_notice_en"; Evidence = "synthetic-notice-en-approval" }
  )) {
    $prefix = "WhatsApp__Templates__$($template.Index)__"
    Assert-Equal -Name "$prefix key" -Actual $whatsApp."${prefix}Key" -Expected $template.Key
    Assert-Equal -Name "$prefix language" -Actual $whatsApp."${prefix}Language" -Expected $template.Language
    Assert-Equal -Name "$prefix name" -Actual $whatsApp."${prefix}Name" -Expected $template.Name
    Assert-Equal -Name "$prefix approval" -Actual $whatsApp."${prefix}Approved" -Expected "false"
    Assert-Equal -Name "$prefix evidence" -Actual $whatsApp."${prefix}ApprovalEvidence" -Expected $template.Evidence
  }
  Assert-Equal -Name "English staff notice provider language" -Actual $whatsApp.WhatsApp__Templates__3__ProviderLanguage -Expected "en"
  if ($compose.services.worker.environment.PSObject.Properties.Name -match "^WhatsApp(Assistant)?__") {
    throw "Only the API may receive WhatsApp configuration; the general worker must not send duplicate staff replies or alerts."
  }
  Assert-Equal -Name "Worker OTLP service name" -Actual $compose.services.worker.environment.OTEL_SERVICE_NAME -Expected "ysheng-worker"
  Assert-Equal -Name "API OTLP endpoint" -Actual $compose.services.api.environment.OTEL_EXPORTER_OTLP_ENDPOINT -Expected "http://otel-collector:4317"
  Assert-Equal -Name "Worker OTLP endpoint" -Actual $compose.services.worker.environment.OTEL_EXPORTER_OTLP_ENDPOINT -Expected "http://otel-collector:4317"
  Assert-Equal -Name "API OTLP protocol" -Actual $compose.services.api.environment.OTEL_EXPORTER_OTLP_PROTOCOL -Expected "grpc"
  Assert-Equal -Name "API OTLP ingest authorization" -Actual $compose.services.api.environment.OTEL_EXPORTER_OTLP_HEADERS -Expected "Authorization=Bearer test-collector-ingest-token-with-32-characters"
  Assert-Equal -Name "Worker OTLP ingest authorization" -Actual $compose.services.worker.environment.OTEL_EXPORTER_OTLP_HEADERS -Expected "Authorization=Bearer test-collector-ingest-token-with-32-characters"
  foreach ($serviceName in @("api", "worker")) {
    $environmentNames = $compose.services.$serviceName.environment.PSObject.Properties.Name
    if ($environmentNames -contains "ASPIRE_DASHBOARD_OTLP_API_KEY" -or $environmentNames -match "^GRAFANA_CLOUD_") {
      throw "$serviceName must not receive destination credentials; only the Collector may receive them."
    }
  }
  Assert-Equal -Name "Collector image" -Actual $collector.image -Expected "otel/opentelemetry-collector-contrib:0.160.0@sha256:5b66b0dc6921f2a439cf50b942ccb9e2a4375f136239a9fdf709ef33e4bfc668"
  Assert-Equal -Name "Collector Grafana endpoint" -Actual $collector.environment.GRAFANA_CLOUD_OTLP_ENDPOINT -Expected "https://otlp-gateway-prod-test.grafana.net/otlp"
  Assert-Equal -Name "Collector restart policy" -Actual $collector.restart -Expected "unless-stopped"
  Assert-Equal -Name "Collector health probe image" -Actual $collectorHealth.image -Expected "curlimages/curl:8.16.0@sha256:463eaf6072688fe96ac64fa623fe73e1dbe25d8ad6c34404a669ad3ce1f104b6"
  $collectorHealthCommand = @($collectorHealth.healthcheck.test) -join " "
  if ($collectorHealthCommand -notmatch "curl.*http://otel-collector:13133/") {
    throw "Collector health must probe the running health_check extension."
  }
  if ($collectorHealthCommand -match "otelcol-contrib.*validate") {
    throw "Collector health must not rely on config validation."
  }
  if (-not $compose.networks.telemetry.internal) {
    throw "The telemetry network must be internal."
  }
  foreach ($serviceName in @("api", "worker", "otel-collector", "otel-collector-health", "production-dashboard")) {
    if ($compose.services.$serviceName.networks.PSObject.Properties.Name -notcontains "telemetry") {
      throw "$serviceName must join the isolated telemetry network."
    }
  }
  $collectorNetworks = @($collector.networks.PSObject.Properties.Name)
  if ($collectorNetworks.Count -ne 2 -or $collectorNetworks -notcontains "telemetry" -or $collectorNetworks -notcontains "telemetry-egress") {
    throw "The Collector must use only the isolated ingest and dedicated egress networks."
  }
  if ($compose.networks.'telemetry-egress'.internal) {
    throw "The dedicated Collector egress network must allow outbound Grafana HTTPS."
  }
  foreach ($service in $compose.services.PSObject.Properties) {
    if ($service.Name -ne "otel-collector" -and $null -ne $service.Value.networks -and $service.Value.networks.PSObject.Properties.Name -contains "telemetry-egress") {
      throw "$($service.Name) must not join the Collector-only egress network."
    }
  }
  if ($compose.services.api.depends_on.'otel-collector-health'.condition -ne "service_healthy" -or $compose.services.worker.depends_on.'otel-collector-health'.condition -ne "service_healthy") {
    throw "API and worker must wait for the Collector runtime health probe."
  }

  Write-Host "Merged Aspire production Compose dashboard contract passed."
}
finally {
  foreach ($entry in $originalEnvironment.GetEnumerator()) {
    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
  }
}
