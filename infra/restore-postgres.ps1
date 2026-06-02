param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [string]$ComposeFile = "infra/docker-compose.yml",
  [string]$EnvPath = ".env",
  [string]$Database = $env:POSTGRES_DB,
  [string]$User = $env:POSTGRES_USER,
  [switch]$ConfirmRestore
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

if (-not $ConfirmRestore) {
  throw "Restore is destructive. Re-run with -ConfirmRestore after verifying BackupPath."
}
if (-not (Test-Path -LiteralPath $BackupPath)) {
  throw "Backup file not found: $BackupPath"
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

$containerRestorePath = "/tmp/ysheng-restore.dump"
Write-Host "Restoring PostgreSQL backup into database '$Database' from: $BackupPath"
docker @composeArgs cp $BackupPath "postgres:$containerRestorePath"
docker @composeArgs exec -T postgres pg_restore -U $User -d $Database --clean --if-exists --no-owner $containerRestorePath
docker @composeArgs exec -T postgres rm -f $containerRestorePath

Write-Host "Restore complete."
