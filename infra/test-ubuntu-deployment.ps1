param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

function Read-Text {
  param([string]$RelativePath)

  $path = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required production deployment asset is missing: $RelativePath"
  }
  return Get-Content -LiteralPath $path -Raw
}

function Assert-Contains {
  param(
    [string]$Name,
    [string]$Text,
    [string]$Expected
  )

  if (-not $Text.Contains($Expected)) {
    throw "$Name is missing expected text: $Expected"
  }
}

$productionCompose = Read-Text "infra/docker-compose.production.yml"
$aspireProductionCompose = Read-Text "infra/docker-compose.aspire.production.yml"
$caddyfile = Read-Text "infra/caddy/Caddyfile"
$apiProgram = Read-Text "services/api/src/YSHeng.Api/Program.cs"
$opsProxy = Read-Text "infra/nginx/ops-proxy.conf"
$bootstrap = Read-Text "infra/ubuntu/bootstrap-shinjiru.sh"
$deploy = Read-Text "infra/ubuntu/deploy-production.sh"
$backup = Read-Text "infra/ubuntu/backup-postgres.sh"
$smoke = Read-Text "infra/ubuntu/production-smoke.sh"
$envValidator = Read-Text "infra/ubuntu/validate-production-env.sh"
$backupService = Read-Text "infra/ubuntu/ysheng-backup.service"
$backupTimer = Read-Text "infra/ubuntu/ysheng-backup.timer"
$workflow = Read-Text ".github/workflows/ci.yml"

foreach ($compose in @($productionCompose, $aspireProductionCompose)) {
  Assert-Contains -Name "Production OCR Compose" -Text $compose -Expected "Ocr__Provider: GoogleDocumentAi"
  Assert-Contains -Name "Production OCR Compose" -Text $compose -Expected 'source: ${GOOGLE_APPLICATION_CREDENTIALS_HOST_PATH}'
  Assert-Contains -Name "Production OCR Compose" -Text $compose -Expected "target: /run/secrets/google-document-ai.json"
  Assert-Contains -Name "Production OCR Compose" -Text $compose -Expected "read_only: true"
}

foreach ($expected in @(
  "app.UseForwardedHeaders();",
  "options.ForwardLimit = 1;",
  'options.KnownIPNetworks.Add(new System.Net.IPNetwork(IPAddress.Parse("172.16.0.0"), 12));'
)) {
  Assert-Contains -Name "Attendance trusted-proxy contract" -Text $apiProgram -Expected $expected
}

foreach ($expected in @(
  "caddy:",
  "image: caddy:2.10-alpine",
  '"80:80"',
  '"443:443"',
  '"443:443/udp"',
  "caddy_data:",
  "caddy_config:",
  "restart: unless-stopped"
)) {
  Assert-Contains -Name "Production Compose" -Text $productionCompose -Expected $expected
}

foreach ($expected in @(
  "build:",
  "context: ..",
  "service_healthy",
  "http://localhost:8080/health/ready",
  "production-dashboard:",
  "mcr.microsoft.com/dotnet/aspire-dashboard:13.4.2@sha256:583b33ffe6cf016115bb55dee00d682ab388832eeb6dd55b6df137e8cae1c1ab",
  "ops-proxy:",
  "image: nginx:1.27.5-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10",
  "./nginx/ops-proxy.conf:/etc/nginx/nginx.conf:ro",
  "./nginx/ops-subpath-navigation.js:/usr/share/nginx/html/ops-subpath-navigation.js:ro",
  "ASPNETCORE_URLS: http://+:18888",
  "ASPIRE_DASHBOARD_OTLP_ENDPOINT_URL: http://+:18889",
  "DASHBOARD__FRONTEND__AUTHMODE: BrowserToken",
  "DASHBOARD__OTLP__AUTHMODE: ApiKey",
  'ASPIRE_DASHBOARD_API_DISABLED: "true"',
  "OTEL_SERVICE_NAME: ysheng-api",
  "OTEL_SERVICE_NAME: ysheng-worker",
  "OTEL_EXPORTER_OTLP_ENDPOINT: http://production-dashboard:18889",
  "OTEL_EXPORTER_OTLP_PROTOCOL: grpc",
  'OTEL_EXPORTER_OTLP_HEADERS: x-otlp-api-key=${ASPIRE_DASHBOARD_OTLP_API_KEY}',
  "networks:",
  "- aspire",
  "./caddy/Caddyfile:/etc/caddy/Caddyfile:ro",
  '"80:80"',
  '"443:443"',
  "restart: unless-stopped"
)) {
  Assert-Contains -Name "Aspire production Compose override" -Text $aspireProductionCompose -Expected $expected
}

foreach ($expected in @(
  '{$FRONTOFFICE_DOMAIN}',
  '{$BACKOFFICE_DOMAIN}',
  '@api path /api/*',
  '@health path /health /health/*',
  '@ops-root path /ops',
  'redir @ops-root /ops/ permanent',
  'handle /ops/*',
  'handle @api',
  'handle @health',
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "reverse_proxy frontoffice:3000",
  "reverse_proxy backoffice:3001",
  "reverse_proxy api:8080",
  "reverse_proxy ops-proxy:8080"
)) {
  Assert-Contains -Name "Caddyfile" -Text $caddyfile -Expected $expected
}

foreach ($expected in @(
  "resolver 127.0.0.11",
  "rewrite ^/ops/(.*)$ /`$1 break;",
  "proxy_pass http://`$dashboard_upstream;",
  "proxy_redirect ~*^(?:https?://[^/]+)?/login\?returnUrl=%2f(.+)`$ /ops/login?returnUrl=%2Fops%2F`$1;",
  "proxy_redirect ~^https?://[^/]+(/.*)$ /ops`$1;",
  "proxy_cookie_path / /ops/;",
  "location = /ops/ops-subpath-navigation.js",
  "sub_filter '<base href=`"/`">' '<base href=`"/ops/`"><script src=`"/ops/ops-subpath-navigation.js`"></script>';"
)) {
  Assert-Contains -Name "Internal /ops proxy" -Text $opsProxy -Expected $expected
}

foreach ($expected in @(
  "set -euo pipefail",
  "ID:-",
  "download.docker.com/linux/ubuntu",
  "docker-compose-plugin",
  "usermod -aG docker",
  "ufw allow",
  "ufw --force enable",
  "ysheng-backup.timer"
)) {
  Assert-Contains -Name "Ubuntu bootstrap" -Text $bootstrap -Expected $expected
}
Assert-Contains -Name "Ubuntu bootstrap" -Text $bootstrap -Expected "infra/aspire-output/docker-compose.yaml"

foreach ($expected in @(
  "--project-name ysheng",
  '--project-directory "$RELEASE_DIR/infra"',
  "infra/aspire-output/docker-compose.yaml",
  "docker-compose.aspire.production.yml",
  "export API_IMAGE=",
  "export WORKER_IMAGE=",
  "validate-production-env.sh",
  'bash "$APP_ROOT/current/infra/ubuntu/backup-postgres.sh"',
  "up -d --build --remove-orphans",
  "production-smoke.sh",
  "sudo -n ln -sfn --"
)) {
  Assert-Contains -Name "Production deploy script" -Text $deploy -Expected $expected
}

foreach ($expected in @(
  "umask 077",
  "pg_dump",
  "-Fc",
  "/var/lib/ysheng-backups",
  "readlink -f",
  "export API_IMAGE="
)) {
  Assert-Contains -Name "Production backup script" -Text $backup -Expected $expected
}

Assert-Contains -Name "Production smoke script" -Text $smoke -Expected "strict-transport-security"
Assert-Contains -Name "Ubuntu environment validator" -Text $envValidator -Expected "Production environment validation failed:"
Assert-Contains -Name "Ubuntu environment validator" -Text $envValidator -Expected "must equal"
Assert-Contains -Name "Ubuntu environment validator" -Text $envValidator -Expected "ASPIRE_DASHBOARD_BROWSER_TOKEN"
Assert-Contains -Name "Ubuntu environment validator" -Text $envValidator -Expected "GOOGLE_APPLICATION_CREDENTIALS_HOST_PATH"
Assert-Contains -Name "Ubuntu environment validator" -Text $envValidator -Expected "Google Application Default Credentials file not found"
Assert-Contains -Name "Backup service" -Text $backupService -Expected "User=__DEPLOY_USER__"
Assert-Contains -Name "Backup timer" -Text $backupTimer -Expected "OnCalendar=*-*-* 02:15:00 UTC"

foreach ($expected in @(
  "workflow_dispatch:",
  "deploy-production:",
  "github.event_name == 'workflow_dispatch'",
  "needs:",
  "environment: production",
  "SHIJIRU_HOST",
  "SHIJIRU_SSH_PRIVATE_KEY",
  "SHIJIRU_KNOWN_HOSTS",
  "PRODUCTION_ENV_FILE",
  "StrictHostKeyChecking=yes",
  "Check merged Aspire production Compose dashboard",
  "Check Ubuntu deployment script syntax",
  "bash -n infra/ubuntu/bootstrap-shinjiru.sh",
  "git archive",
  "actions/download-artifact@v4",
  "tar -C infra/aspire-output",
  "bootstrap-shinjiru.sh",
  "deploy-production.sh"
)) {
  Assert-Contains -Name "GitHub Actions deployment workflow" -Text $workflow -Expected $expected
}

Write-Host "Ubuntu production deployment contract tests passed."
