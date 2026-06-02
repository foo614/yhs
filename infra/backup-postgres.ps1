param(
  [string]$ComposeFile = "infra/docker-compose.yml",
  [string]$EnvPath = ".env",
  [string]$OutputDirectory = "backups",
  [string]$Database = $env:POSTGRES_DB,
  [string]$User = $env:POSTGRES_USER
)

$ErrorActionPreference = "Stop"

function Read-EnvFile {
  param([string]$Path)

  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
  }

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

$envValues = Read-EnvFile $EnvPath
if ([string]::IsNullOrWhiteSpace($Database)) {
  if ($envValues["POSTGRES_DB"]) {
    $Database = $envValues["POSTGRES_DB"]
  }
  else {
    $Database = "ysheng"
  }
}
if ([string]::IsNullOrWhiteSpace($User)) {
  if ($envValues["POSTGRES_USER"]) {
    $User = $envValues["POSTGRES_USER"]
  }
  else {
    $User = "ysheng"
  }
}

$composeArgs = @("compose", "-f", $ComposeFile)
if (Test-Path -LiteralPath $EnvPath) {
  $composeArgs += @("--env-file", $EnvPath)
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $OutputDirectory "ysheng-$timestamp.dump"
$containerBackupPath = "/tmp/ysheng-$timestamp.dump"

Write-Host "Creating PostgreSQL backup: $backupPath"
docker @composeArgs exec -T postgres pg_dump -U $User -d $Database -Fc -f $containerBackupPath
docker @composeArgs cp "postgres:$containerBackupPath" $backupPath
docker @composeArgs exec -T postgres rm -f $containerBackupPath

if (-not (Test-Path -LiteralPath $backupPath) -or (Get-Item -LiteralPath $backupPath).Length -eq 0) {
  throw "Backup file was not created or is empty: $backupPath"
}

Write-Host "Backup complete: $backupPath"
