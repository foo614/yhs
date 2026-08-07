param(
  [string]$EnvPath = ".env",
  [switch]$AllowExampleValues
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $EnvPath)) {
  throw "Environment file not found: $EnvPath. Copy infra/compose.env.example to .env and edit it first."
}

$values = @{}
foreach ($line in Get-Content -LiteralPath $EnvPath) {
  $trimmed = $line.Trim()
  if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
    continue
  }

  $parts = $trimmed.Split("=", 2)
  if ($parts.Count -ne 2 -or [string]::IsNullOrWhiteSpace($parts[0])) {
    throw "Invalid env line: $line"
  }
  $values[$parts[0].Trim()] = $parts[1].Trim()
}

$requiredKeys = @(
  "POSTGRES_DB",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "SEED_ADMIN_EMAIL",
  "SEED_ADMIN_PASSWORD",
  "SEED_DATA_ENABLED",
  "ASPNETCORE_ENVIRONMENT",
  "PUBLIC_API_BASE_URL",
  "FRONTOFFICE_ORIGIN",
  "BACKOFFICE_ORIGIN",
  "API_DOMAIN",
  "FRONTOFFICE_DOMAIN",
  "BACKOFFICE_DOMAIN",
  "TLS_EMAIL"
)

$errors = New-Object System.Collections.Generic.List[string]
foreach ($key in $requiredKeys) {
  if (-not $values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($values[$key])) {
    $errors.Add("$key is required.")
  }
}

if (-not $AllowExampleValues) {
  $unsafeValues = @(
    "change-this-database-password",
    "change-this-admin-password",
    "ChangeMe123!",
    "ysheng_dev"
  )
  foreach ($key in @("POSTGRES_PASSWORD", "SEED_ADMIN_PASSWORD")) {
    if ($values.ContainsKey($key) -and $unsafeValues -contains $values[$key]) {
      $errors.Add("$key still uses an example/default value.")
    }
  }
}

if ($values.ContainsKey("ASPNETCORE_ENVIRONMENT") -and $values["ASPNETCORE_ENVIRONMENT"] -ne "Production") {
  $errors.Add("ASPNETCORE_ENVIRONMENT should be Production for VPS deployment.")
}

foreach ($key in @("PUBLIC_API_BASE_URL", "FRONTOFFICE_ORIGIN", "BACKOFFICE_ORIGIN")) {
  if ($values.ContainsKey($key) -and $values[$key] -notmatch "^https?://") {
    $errors.Add("$key must start with http:// or https://.")
  }
  if ($values.ContainsKey($key) -and $values[$key].EndsWith("/")) {
    $errors.Add("$key must not end with a trailing slash.")
  }
}

foreach ($key in @("API_DOMAIN", "FRONTOFFICE_DOMAIN", "BACKOFFICE_DOMAIN")) {
  if ($values.ContainsKey($key) -and $values[$key] -notmatch "^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$") {
    $errors.Add("$key must be a hostname without a scheme, path, or port.")
  }
}

if ($values.ContainsKey("TLS_EMAIL") -and $values["TLS_EMAIL"] -notmatch "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$") {
  $errors.Add("TLS_EMAIL must be a valid email address for certificate notices.")
}

$originDomainPairs = @(
  @{ Origin = "PUBLIC_API_BASE_URL"; Domain = "API_DOMAIN" },
  @{ Origin = "FRONTOFFICE_ORIGIN"; Domain = "FRONTOFFICE_DOMAIN" },
  @{ Origin = "BACKOFFICE_ORIGIN"; Domain = "BACKOFFICE_DOMAIN" }
)
foreach ($pair in $originDomainPairs) {
  if ($values.ContainsKey($pair.Origin) -and $values.ContainsKey($pair.Domain)) {
    try {
      $originUri = [Uri]$values[$pair.Origin]
      if (-not [string]::Equals($originUri.Host, $values[$pair.Domain], [System.StringComparison]::OrdinalIgnoreCase)) {
        $errors.Add("$($pair.Domain) must match the hostname in $($pair.Origin).")
      }
      if (-not $AllowExampleValues -and $originUri.Scheme -ne "https") {
        $errors.Add("$($pair.Origin) must use https for production TLS.")
      }
    }
    catch {
      $errors.Add("$($pair.Origin) must be a valid URL.")
    }
  }
}

if (-not $AllowExampleValues) {
  foreach ($key in @("PUBLIC_API_BASE_URL", "FRONTOFFICE_ORIGIN", "BACKOFFICE_ORIGIN")) {
    if ($values.ContainsKey($key) -and $values[$key] -match "^https?://(localhost|127\.0\.0\.1|\[::1\])(:|/|$)") {
      $errors.Add("$key points to a local-only host. Use the VPS public domain or IP address.")
    }
    if ($values.ContainsKey($key) -and $values[$key] -match "^https?://([^/:]+\.)?example\.(com|org|net)(:|/|$)") {
      $errors.Add("$key still uses an example domain. Use the VPS public domain or IP address.")
    }
  }
  foreach ($key in @("API_DOMAIN", "FRONTOFFICE_DOMAIN", "BACKOFFICE_DOMAIN")) {
    if ($values.ContainsKey($key) -and ($values[$key] -match "^(localhost|127\.0\.0\.1|::1)$" -or $values[$key] -match "(^|\.)example\.(com|org|net)$")) {
      $errors.Add("$key still uses a local-only or example domain. Use the VPS public domain.")
    }
  }
  if ($values.ContainsKey("TLS_EMAIL") -and $values["TLS_EMAIL"] -match "@example\.(com|org|net)$") {
    $errors.Add("TLS_EMAIL still uses an example domain. Use a real certificate contact address.")
  }
}

if ($values.ContainsKey("SEED_DATA_ENABLED") -and $values["SEED_DATA_ENABLED"] -notin @("true", "false")) {
  $errors.Add("SEED_DATA_ENABLED must be true or false.")
}

if ($errors.Count -gt 0) {
  throw "Compose environment validation failed:`n- $($errors -join "`n- ")"
}

Write-Host "Compose environment validation OK: $EnvPath"
