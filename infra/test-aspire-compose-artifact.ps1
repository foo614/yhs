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

if (-not (Test-Path -LiteralPath $composePath)) {
  throw "Aspire Compose artifact is missing: $composePath"
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

$expectedServices = @("postgres", "api", "worker", "frontoffice", "backoffice", "production-dashboard")
$actualServices = @(Get-ServiceNames)
$missingServices = @($expectedServices | Where-Object { $_ -notin $actualServices })
$extraServices = @($actualServices | Where-Object { $_ -notin $expectedServices })
if ($missingServices.Count -gt 0 -or $extraServices.Count -gt 0) {
  throw "Aspire Compose services mismatch. Missing: $($missingServices -join ', '); Extra: $($extraServices -join ', ')"
}

foreach ($expected in @(
  'image: "docker.io/library/postgres:17"',
  'POSTGRES_DB: "ysheng"',
  'source: "postgres_data"',
  'ConnectionStrings__Default: "Host=postgres;Port=5432;',
  'image: "${API_IMAGE}"',
  'image: "${WORKER_IMAGE}"',
  'image: "${FRONTOFFICE_IMAGE}"',
  'image: "${BACKOFFICE_IMAGE}"',
  'production-dashboard:',
  'ASPIRE_DASHBOARD_FORWARDEDHEADERS_ENABLED: "true"',
  'API_BASE_URL: "http://api:8080"',
  'expose:',
  'networks:',
  'aspire:'
)) {
  Assert-Contains -Name "Aspire Compose artifact" -Text $compose -Expected $expected
}

if ($compose -match "(?m)^\s+ports:") {
  throw "The production Aspire artifact must not expose direct host ports."
}

Write-Host "Aspire Compose artifact tests passed."
