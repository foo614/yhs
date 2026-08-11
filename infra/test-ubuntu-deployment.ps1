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
$caddyfile = Read-Text "infra/caddy/Caddyfile"
$bootstrap = Read-Text "infra/ubuntu/bootstrap-shinjiru.sh"
$deploy = Read-Text "infra/ubuntu/deploy-production.sh"
$backup = Read-Text "infra/ubuntu/backup-postgres.sh"
$smoke = Read-Text "infra/ubuntu/production-smoke.sh"
$envValidator = Read-Text "infra/ubuntu/validate-production-env.sh"
$backupService = Read-Text "infra/ubuntu/ysheng-backup.service"
$backupTimer = Read-Text "infra/ubuntu/ysheng-backup.timer"
$workflow = Read-Text ".github/workflows/ci.yml"

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
  '{$FRONTOFFICE_DOMAIN}',
  '{$BACKOFFICE_DOMAIN}',
  '@api path /api/*',
  '@health path /health /health/*',
  'handle @api',
  'handle @health',
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "reverse_proxy frontoffice:3000",
  "reverse_proxy backoffice:3001",
  "reverse_proxy api:8080"
)) {
  Assert-Contains -Name "Caddyfile" -Text $caddyfile -Expected $expected
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

foreach ($expected in @(
  "--project-name ysheng",
  '--project-directory "$RELEASE_DIR/infra"',
  "docker-compose.production.yml",
  "validate-production-env.sh",
  "backup-postgres.sh",
  "up -d --build --remove-orphans",
  "production-smoke.sh",
  "ln -sfn"
)) {
  Assert-Contains -Name "Production deploy script" -Text $deploy -Expected $expected
}

foreach ($expected in @(
  "umask 077",
  "pg_dump",
  "-Fc",
  "/var/lib/ysheng-backups"
)) {
  Assert-Contains -Name "Production backup script" -Text $backup -Expected $expected
}

Assert-Contains -Name "Production smoke script" -Text $smoke -Expected "strict-transport-security"
Assert-Contains -Name "Ubuntu environment validator" -Text $envValidator -Expected "Production environment validation failed:"
Assert-Contains -Name "Ubuntu environment validator" -Text $envValidator -Expected "must equal"
Assert-Contains -Name "Backup service" -Text $backupService -Expected "User=__DEPLOY_USER__"
Assert-Contains -Name "Backup timer" -Text $backupTimer -Expected "OnCalendar=*-*-* 02:15:00 UTC"

foreach ($expected in @(
  "workflow_dispatch:",
  "deploy-production:",
  "needs:",
  "environment: production",
  "SHIJIRU_HOST",
  "SHIJIRU_SSH_PRIVATE_KEY",
  "SHIJIRU_KNOWN_HOSTS",
  "PRODUCTION_ENV_FILE",
  "StrictHostKeyChecking=yes",
  "Check Ubuntu deployment script syntax",
  "bash -n infra/ubuntu/bootstrap-shinjiru.sh",
  "git archive",
  "bootstrap-shinjiru.sh",
  "deploy-production.sh"
)) {
  Assert-Contains -Name "GitHub Actions deployment workflow" -Text $workflow -Expected $expected
}

Write-Host "Ubuntu production deployment contract tests passed."
