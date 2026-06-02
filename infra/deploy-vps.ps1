param(
  [string]$ComposeFile = "infra/docker-compose.yml",
  [string]$EnvPath = ".env",
  [int]$TimeoutSeconds = 30,
  [switch]$BackupBeforeDeploy,
  [switch]$SkipSmoke,
  [switch]$AllowExampleEnvValues
)

$ErrorActionPreference = "Stop"

function Read-EnvFile {
  param([string]$Path)
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
      continue
    }
    $parts = $trimmed.Split("=", 2)
    if ($parts.Count -eq 2) {
      $values[$parts[0].Trim()] = $parts[1].Trim()
    }
  }
  return $values
}

function Wait-HttpOk {
  param(
    [string]$Url,
    [string]$Name,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        Write-Host "$Name reachable: $Url"
        return
      }
    }
    catch {
      Start-Sleep -Seconds 2
    }
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for $Name at $Url"
}

Write-Host "Validating Compose environment..."
if ($AllowExampleEnvValues) {
  & (Join-Path (Get-Location) "infra/validate-compose-env.ps1") -EnvPath $EnvPath -AllowExampleValues
}
else {
  & (Join-Path (Get-Location) "infra/validate-compose-env.ps1") -EnvPath $EnvPath
}
$envValues = Read-EnvFile $EnvPath

Write-Host "Checking Docker Compose contract..."
& (Join-Path (Get-Location) "infra/test-compose-contract.ps1") -ComposeFile $ComposeFile

Write-Host "Running Docker preflight..."
if ($AllowExampleEnvValues) {
  & (Join-Path (Get-Location) "infra/docker-preflight.ps1") -TimeoutSeconds $TimeoutSeconds -EnvPath $EnvPath -AllowExampleEnvValues
}
else {
  & (Join-Path (Get-Location) "infra/docker-preflight.ps1") -TimeoutSeconds $TimeoutSeconds -EnvPath $EnvPath
}

if ($BackupBeforeDeploy) {
  Write-Host "Creating pre-deploy database backup..."
  & (Join-Path (Get-Location) "infra/backup-postgres.ps1") -ComposeFile $ComposeFile -EnvPath $EnvPath
}

Write-Host "Building and starting Docker Compose stack..."
docker compose -f $ComposeFile --env-file $EnvPath up -d --build

if (-not $SkipSmoke) {
  $apiBaseUrl = if ($envValues["PUBLIC_API_BASE_URL"]) { $envValues["PUBLIC_API_BASE_URL"] } else { "http://localhost:5000" }
  $frontOfficeUrl = if ($envValues["FRONTOFFICE_ORIGIN"]) { $envValues["FRONTOFFICE_ORIGIN"] } else { "http://localhost:3000" }
  $backOfficeUrl = if ($envValues["BACKOFFICE_ORIGIN"]) { $envValues["BACKOFFICE_ORIGIN"] } else { "http://localhost:3001" }
  $adminEmail = if ($envValues["SEED_ADMIN_EMAIL"]) { $envValues["SEED_ADMIN_EMAIL"] } else { "admin@ysheng.local" }
  $adminPassword = if ($envValues["SEED_ADMIN_PASSWORD"]) { $envValues["SEED_ADMIN_PASSWORD"] } else { "ChangeMe123!" }

  Write-Host "Waiting for deployed services before smoke test..."
  Wait-HttpOk "$apiBaseUrl/health/ready" "API readiness" $TimeoutSeconds
  Wait-HttpOk $frontOfficeUrl "Front office" $TimeoutSeconds
  Wait-HttpOk $backOfficeUrl "Back office" $TimeoutSeconds

  Write-Host "Running deployment smoke test..."
  & (Join-Path (Get-Location) "infra/smoke-test.ps1") `
    -ApiBaseUrl $apiBaseUrl `
    -FrontOfficeUrl $frontOfficeUrl `
    -BackOfficeUrl $backOfficeUrl `
    -AdminEmail $adminEmail `
    -AdminPassword $adminPassword
}

Write-Host "VPS deployment completed."
