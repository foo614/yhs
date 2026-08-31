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
    GOOGLE_DOCUMENT_AI_PROJECT_ID = "ysheng-test"
    GOOGLE_DOCUMENT_AI_LOCATION = "asia-southeast1"
    GOOGLE_DOCUMENT_AI_DEFAULT_PROCESSOR_ID = "general-ocr-processor"
    GOOGLE_DOCUMENT_AI_INVOICE_PROCESSOR_ID = "invoice-processor"
    GOOGLE_DOCUMENT_AI_EXPENSE_PROCESSOR_ID = "expense-processor"
    GOOGLE_APPLICATION_CREDENTIALS_HOST_PATH = "/opt/ysheng/shared/google-document-ai.json"
    ASPIRE_DASHBOARD_BROWSER_TOKEN = "dashboard-browser-token-with-32-characters"
    ASPIRE_DASHBOARD_OTLP_API_KEY = "dashboard-otlp-key-with-32-characters"
    PUBLIC_API_BASE_URL = "https://portal.ysheng.example.my"
    FRONTOFFICE_ORIGIN = "https://www.ysheng.example.my"
    BACKOFFICE_ORIGIN = "https://portal.ysheng.example.my"
    API_DOMAIN = "portal.ysheng.example.my"
    FRONTOFFICE_DOMAIN = "www.ysheng.example.my"
    BACKOFFICE_DOMAIN = "portal.ysheng.example.my"
    TLS_EMAIL = "admin@ysheng.example.my"
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

$placeholderDashboardSecret = New-TestEnvFile -Name "placeholder-dashboard-secret" -Overrides @{
  ASPIRE_DASHBOARD_OTLP_API_KEY = "change-this-dashboard-otlp-api-key"
}
Assert-ValidationFails -Name "Placeholder dashboard secret" -Path $placeholderDashboardSecret -ExpectedMessage "ASPIRE_DASHBOARD_OTLP_API_KEY still uses an example/default value."

$shortDashboardToken = New-TestEnvFile -Name "short-dashboard-token" -Overrides @{
  ASPIRE_DASHBOARD_BROWSER_TOKEN = "short-dashboard-token"
}
Assert-ValidationFails -Name "Short dashboard token" -Path $shortDashboardToken -ExpectedMessage "ASPIRE_DASHBOARD_BROWSER_TOKEN must be at least 32 characters long."

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

$mismatchedDomain = New-TestEnvFile -Name "mismatched-domain" -Overrides @{
  API_DOMAIN = "other.ysheng.example.my"
}
Assert-ValidationFails -Name "Mismatched Caddy domain" -Path $mismatchedDomain -ExpectedMessage "API_DOMAIN must match the hostname in PUBLIC_API_BASE_URL."

$exampleTlsEmail = New-TestEnvFile -Name "example-tls-email" -Overrides @{
  TLS_EMAIL = "admin@example.com"
}
Assert-ValidationFails -Name "Example TLS email" -Path $exampleTlsEmail -ExpectedMessage "TLS_EMAIL still uses an example domain."

$badSeedBoolean = New-TestEnvFile -Name "bad-seed-bool" -Overrides @{
  SEED_DATA_ENABLED = "yes"
}
Assert-ValidationFails -Name "Seed data boolean" -Path $badSeedBoolean -ExpectedMessage "SEED_DATA_ENABLED must be true or false."

$missingGoogleOcrConfig = New-TestEnvFile -Name "missing-google-ocr-config" -Overrides @{
  GOOGLE_DOCUMENT_AI_PROJECT_ID = $null
}
Assert-ValidationFails -Name "Missing Google OCR configuration" -Path $missingGoogleOcrConfig -ExpectedMessage "GOOGLE_DOCUMENT_AI_PROJECT_ID is required for Google Document AI."

$validGoogleOcrConfig = New-TestEnvFile -Name "valid-google-ocr-config" -Overrides @{
  GOOGLE_DOCUMENT_AI_PROJECT_ID = "ysheng-production"
  GOOGLE_DOCUMENT_AI_LOCATION = "asia-southeast1"
  GOOGLE_DOCUMENT_AI_DEFAULT_PROCESSOR_ID = "general-ocr-processor"
  GOOGLE_DOCUMENT_AI_INVOICE_PROCESSOR_ID = "invoice-processor"
  GOOGLE_DOCUMENT_AI_EXPENSE_PROCESSOR_ID = "expense-processor"
  GOOGLE_APPLICATION_CREDENTIALS_HOST_PATH = "/opt/ysheng/shared/google-document-ai.json"
}
Assert-ValidationPasses -Name "Google OCR configuration" -Path $validGoogleOcrConfig

$placeholderGoogleOcrConfig = New-TestEnvFile -Name "placeholder-google-ocr-config" -Overrides @{
  GOOGLE_DOCUMENT_AI_PROJECT_ID = "replace-with-google-cloud-project-id"
  GOOGLE_DOCUMENT_AI_LOCATION = "asia-southeast1"
  GOOGLE_DOCUMENT_AI_DEFAULT_PROCESSOR_ID = "replace-with-enterprise-ocr-processor-id"
  GOOGLE_APPLICATION_CREDENTIALS_HOST_PATH = "/opt/ysheng/shared/google-document-ai.json"
}
Assert-ValidationFails -Name "Placeholder Google OCR configuration" -Path $placeholderGoogleOcrConfig -ExpectedMessage "GOOGLE_DOCUMENT_AI_PROJECT_ID still uses an example value."

$localExample = Join-Path $repoRoot "infra/compose.env.local.example"
Assert-ValidationPasses -Name "Local Docker example with override" -Path $localExample -AllowExampleValues
Assert-ValidationFails -Name "Local Docker example without override" -Path $localExample -ExpectedMessage "POSTGRES_PASSWORD still uses an example/default value."

Write-Host "Compose environment validation tests passed."
