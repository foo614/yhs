param(
  [string]$ComposeFile = "infra/docker-compose.yml"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$composePath = if ([System.IO.Path]::IsPathRooted($ComposeFile)) {
  $ComposeFile
}
else {
  Join-Path $repoRoot $ComposeFile
}

if (-not (Test-Path -LiteralPath $composePath)) {
  throw "Compose file not found: $composePath"
}

$compose = Get-Content -LiteralPath $composePath -Raw
$lines = Get-Content -LiteralPath $composePath

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

function Get-ServiceNames {
  $names = New-Object System.Collections.Generic.List[string]
  $insideServices = $false
  foreach ($line in $lines) {
    if ($line -eq "services:") {
      $insideServices = $true
      continue
    }

    if ($insideServices -and $line -match "^\S") {
      break
    }

    if ($insideServices -and $line -match "^  ([A-Za-z0-9_-]+):\s*$") {
      $names.Add($Matches[1])
    }
  }
  return $names.ToArray()
}

function Get-ServiceBlock {
  param([string]$ServiceName)

  $serviceStart = -1
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -eq "  ${ServiceName}:") {
      $serviceStart = $index
      break
    }
  }

  if ($serviceStart -lt 0) {
    throw "Service '$ServiceName' was not found in $ComposeFile."
  }

  $blockLines = New-Object System.Collections.Generic.List[string]
  for ($index = $serviceStart + 1; $index -lt $lines.Count; $index++) {
    $line = $lines[$index]
    if ($line -match "^  [A-Za-z0-9_-]+:\s*$") {
      break
    }
    if ($line -match "^\S") {
      break
    }
    $blockLines.Add($line)
  }

  return $blockLines -join "`n"
}

$expectedServices = @("postgres", "api", "worker", "frontoffice", "backoffice")
$actualServices = @(Get-ServiceNames)
$missingServices = @($expectedServices | Where-Object { $_ -notin $actualServices })
$extraServices = @($actualServices | Where-Object { $_ -notin $expectedServices })

if ($missingServices.Count -gt 0 -or $extraServices.Count -gt 0) {
  throw "Compose services mismatch. Missing: $($missingServices -join ', '); Extra: $($extraServices -join ', ')"
}

Assert-Contains -Name "Compose volumes" -Text $compose -Expected "volumes:"
Assert-Contains -Name "PostgreSQL volume" -Text $compose -Expected "postgres_data:"

$postgres = Get-ServiceBlock "postgres"
Assert-Contains -Name "postgres image" -Text $postgres -Expected "image: postgres:17"
Assert-Contains -Name "postgres database env" -Text $postgres -Expected 'POSTGRES_DB: ${POSTGRES_DB:-ysheng}'
Assert-Contains -Name "postgres user env" -Text $postgres -Expected 'POSTGRES_USER: ${POSTGRES_USER:-ysheng}'
Assert-Contains -Name "postgres password env" -Text $postgres -Expected 'POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-ysheng_dev}'
Assert-Contains -Name "postgres port" -Text $postgres -Expected '"${POSTGRES_PORT:-5432}:5432"'
Assert-Contains -Name "postgres data volume" -Text $postgres -Expected "postgres_data:/var/lib/postgresql/data"
Assert-Contains -Name "postgres healthcheck" -Text $postgres -Expected "pg_isready"

$api = Get-ServiceBlock "api"
Assert-Contains -Name "api dockerfile" -Text $api -Expected "dockerfile: services/api/src/YSHeng.Api/Dockerfile"
Assert-Contains -Name "api environment" -Text $api -Expected 'ASPNETCORE_ENVIRONMENT: ${ASPNETCORE_ENVIRONMENT:-Production}'
Assert-Contains -Name "api urls" -Text $api -Expected "ASPNETCORE_URLS: http://+:8080"
Assert-Contains -Name "api connection string" -Text $api -Expected "ConnectionStrings__Default: Host=postgres;Port=5432;"
Assert-Contains -Name "api front-office CORS" -Text $api -Expected 'AllowedOrigins__0: ${FRONTOFFICE_ORIGIN:-http://localhost:3000}'
Assert-Contains -Name "api back-office CORS" -Text $api -Expected 'AllowedOrigins__1: ${BACKOFFICE_ORIGIN:-http://localhost:3001}'
Assert-Contains -Name "api seed email" -Text $api -Expected 'SeedAdmin__Email: ${SEED_ADMIN_EMAIL:-admin@ysheng.local}'
Assert-Contains -Name "api seed password" -Text $api -Expected 'SeedAdmin__Password: ${SEED_ADMIN_PASSWORD:-ChangeMe123!}'
Assert-Contains -Name "api port" -Text $api -Expected '"${API_PORT:-5000}:8080"'
Assert-Contains -Name "api depends on postgres health" -Text $api -Expected "postgres:"
Assert-Contains -Name "api health dependency condition" -Text $api -Expected "condition: service_healthy"
Assert-Contains -Name "api readiness healthcheck" -Text $api -Expected "http://localhost:8080/health/ready"

$worker = Get-ServiceBlock "worker"
Assert-Contains -Name "worker dockerfile" -Text $worker -Expected "dockerfile: services/api/src/YSHeng.Api/Dockerfile"
Assert-Contains -Name "worker enabled flag" -Text $worker -Expected 'Worker__Enabled: "true"'
Assert-Contains -Name "worker connection string" -Text $worker -Expected "ConnectionStrings__Default: Host=postgres;Port=5432;"
Assert-Contains -Name "worker depends on postgres health" -Text $worker -Expected "postgres:"
if ($worker -match "(?m)^    ports:") {
  throw "Worker service should not publish ports."
}

$frontoffice = Get-ServiceBlock "frontoffice"
Assert-Contains -Name "frontoffice dockerfile" -Text $frontoffice -Expected "dockerfile: apps/frontoffice/Dockerfile"
Assert-Contains -Name "frontoffice build API URL" -Text $frontoffice -Expected 'NEXT_PUBLIC_API_BASE_URL: ${PUBLIC_API_BASE_URL:-http://localhost:5000}'
Assert-Contains -Name "frontoffice port" -Text $frontoffice -Expected '"${FRONTOFFICE_PORT:-3000}:3000"'
Assert-Contains -Name "frontoffice depends on api health" -Text $frontoffice -Expected "api:"
Assert-Contains -Name "frontoffice healthcheck" -Text $frontoffice -Expected 'http://$$(hostname):3000'

$backoffice = Get-ServiceBlock "backoffice"
Assert-Contains -Name "backoffice dockerfile" -Text $backoffice -Expected "dockerfile: apps/backoffice/Dockerfile"
Assert-Contains -Name "backoffice build API URL" -Text $backoffice -Expected 'VITE_API_BASE_URL: ${PUBLIC_API_BASE_URL:-http://localhost:5000}'
Assert-Contains -Name "backoffice port" -Text $backoffice -Expected '"${BACKOFFICE_PORT:-3001}:3001"'
Assert-Contains -Name "backoffice depends on api health" -Text $backoffice -Expected "api:"
Assert-Contains -Name "backoffice healthcheck" -Text $backoffice -Expected "http://localhost:3001"

foreach ($relativeDockerfile in @(
  "services/api/src/YSHeng.Api/Dockerfile",
  "apps/frontoffice/Dockerfile",
  "apps/backoffice/Dockerfile"
)) {
  $dockerfilePath = Join-Path $repoRoot $relativeDockerfile
  if (-not (Test-Path -LiteralPath $dockerfilePath)) {
    throw "Referenced Dockerfile is missing: $relativeDockerfile"
  }
}

Write-Host "Docker Compose contract tests passed."
