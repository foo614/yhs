param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

function Read-Text {
  param([string]$RelativePath)

  $path = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required deployment script is missing: $RelativePath"
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

function Assert-Order {
  param(
    [string]$Name,
    [string]$Text,
    [string[]]$Steps
  )

  $position = -1
  foreach ($step in $Steps) {
    $next = $Text.IndexOf($step, [System.StringComparison]::Ordinal)
    if ($next -lt 0) {
      throw "$Name is missing expected step: $step"
    }
    if ($next -le $position) {
      throw "$Name has steps out of order near: $step"
    }
    $position = $next
  }
}

$deploy = Read-Text "infra/deploy-vps.ps1"
$preflight = Read-Text "infra/docker-preflight.ps1"
$backup = Read-Text "infra/backup-postgres.ps1"
$restore = Read-Text "infra/restore-postgres.ps1"

Assert-Order -Name "deploy-vps" -Text $deploy -Steps @(
  "Validating Compose environment...",
  "infra/validate-compose-env.ps1",
  "Checking Docker Compose contract...",
  "infra/test-compose-contract.ps1",
  "Running Docker preflight...",
  "infra/docker-preflight.ps1",
  "Creating pre-deploy database backup...",
  "Building and starting Docker Compose stack...",
  "Waiting for deployed services before smoke test...",
  "Running deployment smoke test..."
)
Assert-Contains -Name "deploy-vps compose env file" -Text $deploy -Expected 'docker compose -f $ComposeFile --env-file $EnvPath up -d --build'
Assert-Contains -Name "deploy-vps smoke API URL" -Text $deploy -Expected '$apiBaseUrl = if ($envValues["PUBLIC_API_BASE_URL"])'
Assert-Contains -Name "deploy-vps smoke front URL" -Text $deploy -Expected '$frontOfficeUrl = if ($envValues["FRONTOFFICE_ORIGIN"])'
Assert-Contains -Name "deploy-vps smoke back URL" -Text $deploy -Expected '$backOfficeUrl = if ($envValues["BACKOFFICE_ORIGIN"])'
Assert-Contains -Name "deploy-vps smoke admin email" -Text $deploy -Expected '$adminEmail = if ($envValues["SEED_ADMIN_EMAIL"])'
Assert-Contains -Name "deploy-vps smoke admin password" -Text $deploy -Expected '$adminPassword = if ($envValues["SEED_ADMIN_PASSWORD"])'
Assert-Contains -Name "deploy-vps backup env file" -Text $deploy -Expected 'infra/backup-postgres.ps1") -ComposeFile $ComposeFile -EnvPath $EnvPath'
Assert-Contains -Name "deploy-vps wait helper" -Text $deploy -Expected "function Wait-HttpOk"
Assert-Contains -Name "deploy-vps waits for API readiness" -Text $deploy -Expected 'Wait-HttpOk "$apiBaseUrl/health/ready" "API readiness" $TimeoutSeconds'
Assert-Contains -Name "deploy-vps waits for front office" -Text $deploy -Expected 'Wait-HttpOk $frontOfficeUrl "Front office" $TimeoutSeconds'
Assert-Contains -Name "deploy-vps waits for back office" -Text $deploy -Expected 'Wait-HttpOk $backOfficeUrl "Back office" $TimeoutSeconds'

Assert-Order -Name "docker-preflight" -Text $preflight -Steps @(
  "Checking Dockerfiles...",
  "infra/test-dockerfiles.ps1",
  "Checking Docker Compose contract...",
  "infra/test-compose-contract.ps1",
  "Checking Docker engine...",
  "Checking Docker Desktop service...",
  "Docker server version",
  "Checking Compose environment...",
  "infra/validate-compose-env.ps1",
  "Checking Docker Compose...",
  "Docker Compose config"
)
Assert-Contains -Name "docker-preflight bounded docker command" -Text $preflight -Expected 'Invoke-BoundedCommand -FilePath "docker"'
Assert-Contains -Name "docker-preflight Unicode output reader" -Text $preflight -Expected "function Read-BoundedCommandText"
Assert-Contains -Name "docker-preflight null-byte output detection" -Text $preflight -Expected '$utf8.Contains([string][char]0)'
Assert-Contains -Name "docker-preflight diagnostics function" -Text $preflight -Expected "function Write-DockerDesktopDiagnostics"
Assert-Contains -Name "docker-preflight diagnostics invocation" -Text $preflight -Expected "Write-DockerDesktopDiagnostics"
Assert-Contains -Name "docker-preflight service guard function" -Text $preflight -Expected "function Assert-DockerDesktopServiceReady"
Assert-Contains -Name "docker-preflight service stopped failure" -Text $preflight -Expected "Docker Desktop service com.docker.service is"
Assert-Contains -Name "docker-preflight Docker Desktop process check" -Text $preflight -Expected 'Get-Process -Name "Docker Desktop"'
Assert-Contains -Name "docker-preflight Docker service check" -Text $preflight -Expected 'Get-Service -Name "com.docker.service"'
Assert-Contains -Name "docker-preflight WSL distro check" -Text $preflight -Expected 'Invoke-BoundedCommand -FilePath "wsl"'
Assert-Contains -Name "docker-preflight timeout message" -Text $preflight -Expected "Docker Desktop or the Linux engine is not responding."
Assert-Contains -Name "docker-preflight port override guidance" -Text $preflight -Expected "Use POSTGRES_PORT, API_PORT, FRONTOFFICE_PORT, and BACKOFFICE_PORT overrides before running compose."

Assert-Contains -Name "backup script default database" -Text $backup -Expected '$Database = "ysheng"'
Assert-Contains -Name "backup script default user" -Text $backup -Expected '$User = "ysheng"'
Assert-Contains -Name "backup script env path parameter" -Text $backup -Expected '[string]$EnvPath = ".env"'
Assert-Contains -Name "backup script reads env file" -Text $backup -Expected '$envValues = Read-EnvFile $EnvPath'
Assert-Contains -Name "backup script compose env file" -Text $backup -Expected '$composeArgs += @("--env-file", $EnvPath)'
Assert-Contains -Name "backup script creates output directory" -Text $backup -Expected 'New-Item -ItemType Directory -Force -Path $OutputDirectory'
Assert-Contains -Name "backup script custom format dump" -Text $backup -Expected 'pg_dump -U $User -d $Database -Fc -f $containerBackupPath'
Assert-Contains -Name "backup script non-interactive exec" -Text $backup -Expected 'docker @composeArgs exec -T postgres'
Assert-Contains -Name "backup script copies dump out" -Text $backup -Expected 'docker @composeArgs cp "postgres:$containerBackupPath" $backupPath'
Assert-Contains -Name "backup script cleans temp dump" -Text $backup -Expected 'rm -f $containerBackupPath'
Assert-Contains -Name "backup script verifies non-empty file" -Text $backup -Expected '(Get-Item -LiteralPath $backupPath).Length -eq 0'

Assert-Contains -Name "restore script requires backup path" -Text $restore -Expected '[Parameter(Mandatory = $true)]'
Assert-Contains -Name "restore script destructive confirmation" -Text $restore -Expected 'if (-not $ConfirmRestore)'
Assert-Contains -Name "restore script missing backup guard" -Text $restore -Expected 'Backup file not found: $BackupPath'
Assert-Contains -Name "restore script default database" -Text $restore -Expected '$Database = "ysheng"'
Assert-Contains -Name "restore script default user" -Text $restore -Expected '$User = "ysheng"'
Assert-Contains -Name "restore script env path parameter" -Text $restore -Expected '[string]$EnvPath = ".env"'
Assert-Contains -Name "restore script reads env file" -Text $restore -Expected '$envValues = Read-EnvFile $EnvPath'
Assert-Contains -Name "restore script compose env file" -Text $restore -Expected '$composeArgs += @("--env-file", $EnvPath)'
Assert-Contains -Name "restore script copies dump in" -Text $restore -Expected 'docker @composeArgs cp $BackupPath "postgres:$containerRestorePath"'
Assert-Contains -Name "restore script clean restore" -Text $restore -Expected 'pg_restore -U $User -d $Database --clean --if-exists --no-owner $containerRestorePath'
Assert-Contains -Name "restore script non-interactive exec" -Text $restore -Expected 'docker @composeArgs exec -T postgres'
Assert-Contains -Name "restore script cleans temp dump" -Text $restore -Expected 'rm -f $containerRestorePath'

Write-Host "Deployment script contract tests passed."
