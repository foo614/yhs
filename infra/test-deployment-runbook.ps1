param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runbookPath = Join-Path $repoRoot "docs/DEPLOYMENT_RUNBOOK.md"

if (-not (Test-Path -LiteralPath $runbookPath)) {
  throw "Deployment runbook is missing: docs/DEPLOYMENT_RUNBOOK.md"
}

$text = Get-Content -LiteralPath $runbookPath -Raw

foreach ($expected in @(
  "YS Heng Deployment Runbook",
  "PUBLIC_API_BASE_URL",
  "FRONTOFFICE_ORIGIN",
  "BACKOFFICE_ORIGIN",
  ".\infra\validate-compose-env.ps1",
  ".\infra\docker-preflight.ps1",
  "continues and probes the Linux engine directly",
  ".\infra\deploy-vps.ps1",
  "-EnvPath .env.production",
  ".\infra\smoke-test.ps1",
  "The deployment is not proven until this succeeds",
  "-BackupBeforeDeploy",
  ".\infra\backup-postgres.ps1",
  ".\infra\restore-postgres.ps1",
  "-ConfirmRestore",
  "SEED_DATA_ENABLED=false",
  "PostgreSQL blobs",
  "GitHub Actions CI run",
  "yshengproof",
  "YS Heng stack smoke test passed."
)) {
  if (-not $text.Contains($expected)) {
    throw "Deployment runbook is missing expected text: $expected"
  }
}

Write-Host "Deployment runbook tests passed."
