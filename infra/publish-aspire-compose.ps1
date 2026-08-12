param(
  [string]$OutputPath = "infra/aspire-output"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath
}
else {
  Join-Path $repoRoot $OutputPath
}

if (Test-Path -LiteralPath $outputDirectory) {
  $existingFiles = Get-ChildItem -LiteralPath $outputDirectory -Force
  if ($existingFiles.Count -gt 0) {
    throw "Aspire Compose output already exists: $outputDirectory. Remove it explicitly before publishing a new artifact."
  }
}

dotnet tool restore
if ($LASTEXITCODE -ne 0) {
  throw "Could not restore the pinned Aspire CLI."
}

$appHost = Join-Path $repoRoot "services/api/src/YSHeng.AppHost/YSHeng.AppHost.csproj"
dotnet tool run aspire -- publish --apphost $appHost --output-path $outputDirectory --non-interactive --nologo
if ($LASTEXITCODE -ne 0) {
  throw "Aspire Compose publish failed."
}

$composePath = Join-Path $outputDirectory "docker-compose.yaml"
if (-not (Test-Path -LiteralPath $composePath)) {
  throw "Aspire publish did not create docker-compose.yaml."
}

Write-Host "Aspire Compose artifact created: $composePath"
