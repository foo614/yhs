param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$validator = Join-Path $repoRoot "infra/validate-compose-env.ps1"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "ysheng-compose-env-tests"

New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

function New-TestEnvFile {
  param(
    [string]$Name,
    [hashtable]$Overrides = @{}
  )

  $values = [ordered]@{
    POSTGRES_DB = "ysheng"
    POSTGRES_USER = "ysheng"
    POSTGRES_PASSWORD = "S3cure-db-password!"
    SEED_ADMIN_EMAIL = "admin@ysheng.local"
    SEED_ADMIN_PASSWORD = "S3cure-admin-password!"
    SEED_DATA_ENABLED = "true"
    ASPNETCORE_ENVIRONMENT = "Production"
    PUBLIC_API_BASE_URL = "https://api.ysheng.example.my"
    FRONTOFFICE_ORIGIN = "https://www.ysheng.example.my"
    BACKOFFICE_ORIGIN = "https://admin.ysheng.example.my"
  }

  foreach ($key in $Overrides.Keys) {
    if ($null -eq $Overrides[$key]) {
      $values.Remove($key)
    }
    else {
      $values[$key] = $Overrides[$key]
    }
  }

  $path = Join-Path $tempRoot "$Name.env"
  $lines = foreach ($entry in $values.GetEnumerator()) {
    "$($entry.Key)=$($entry.Value)"
  }
  Set-Content -LiteralPath $path -Value $lines -Encoding utf8
  return $path
}

function Assert-ValidationPasses {
  param(
    [string]$Name,
    [string]$Path,
    [switch]$AllowExampleValues
  )

  try {
    if ($AllowExampleValues) {
      & $validator -EnvPath $Path -AllowExampleValues | Out-Null
    }
    else {
      & $validator -EnvPath $Path | Out-Null
    }
  }
  catch {
    throw "$Name should have passed compose env validation. $($_.Exception.Message)"
  }
}

function Assert-ValidationFails {
  param(
    [string]$Name,
    [string]$Path,
    [string]$ExpectedMessage,
    [switch]$AllowExampleValues
  )

  try {
    if ($AllowExampleValues) {
      & $validator -EnvPath $Path -AllowExampleValues | Out-Null
    }
    else {
      & $validator -EnvPath $Path | Out-Null
    }
  }
  catch {
    if ($_.Exception.Message -notmatch [regex]::Escape($ExpectedMessage)) {
      throw "$Name failed with unexpected message. Expected '$ExpectedMessage' but got '$($_.Exception.Message)'"
    }
    return
  }

  throw "$Name should have failed compose env validation."
}

$validProduction = New-TestEnvFile -Name "valid-production"
Assert-ValidationPasses -Name "Production env" -Path $validProduction

$missingRequired = New-TestEnvFile -Name "missing-public-api" -Overrides @{ PUBLIC_API_BASE_URL = $null }
Assert-ValidationFails -Name "Missing required URL" -Path $missingRequired -ExpectedMessage "PUBLIC_API_BASE_URL is required."

$placeholderSecrets = New-TestEnvFile -Name "placeholder-secrets" -Overrides @{
  POSTGRES_PASSWORD = "change-this-database-password"
  SEED_ADMIN_PASSWORD = "ChangeMe123!"
}
Assert-ValidationFails -Name "Placeholder secrets" -Path $placeholderSecrets -ExpectedMessage "POSTGRES_PASSWORD still uses an example/default value."

$localUrls = New-TestEnvFile -Name "local-urls" -Overrides @{
  PUBLIC_API_BASE_URL = "http://localhost:5000"
  FRONTOFFICE_ORIGIN = "http://127.0.0.1:3000"
  BACKOFFICE_ORIGIN = "http://[::1]:3001"
}
Assert-ValidationFails -Name "Local-only URLs" -Path $localUrls -ExpectedMessage "PUBLIC_API_BASE_URL points to a local-only host."

$exampleDomains = New-TestEnvFile -Name "example-domains" -Overrides @{
  PUBLIC_API_BASE_URL = "https://api.example.com"
}
Assert-ValidationFails -Name "Example domains" -Path $exampleDomains -ExpectedMessage "PUBLIC_API_BASE_URL still uses an example domain."

$trailingSlash = New-TestEnvFile -Name "trailing-slash" -Overrides @{
  BACKOFFICE_ORIGIN = "https://admin.ysheng.example.my/"
}
Assert-ValidationFails -Name "Trailing slash" -Path $trailingSlash -ExpectedMessage "BACKOFFICE_ORIGIN must not end with a trailing slash."

$badSeedBoolean = New-TestEnvFile -Name "bad-seed-bool" -Overrides @{
  SEED_DATA_ENABLED = "yes"
}
Assert-ValidationFails -Name "Seed data boolean" -Path $badSeedBoolean -ExpectedMessage "SEED_DATA_ENABLED must be true or false."

$localExample = Join-Path $repoRoot "infra/compose.env.local.example"
Assert-ValidationPasses -Name "Local Docker example with override" -Path $localExample -AllowExampleValues
Assert-ValidationFails -Name "Local Docker example without override" -Path $localExample -ExpectedMessage "POSTGRES_PASSWORD still uses an example/default value."

Write-Host "Compose environment validation tests passed."
