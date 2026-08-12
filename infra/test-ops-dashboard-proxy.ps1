$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$caddyfile = Get-Content -Raw (Join-Path $repoRoot "infra/caddy/Caddyfile")
$opsProxy = Get-Content -Raw (Join-Path $repoRoot "infra/nginx/ops-proxy.conf")

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

foreach ($expected in @(
  '@ops-login-script path /Components/Pages/Login.razor.js',
  'uri replace /Components/Pages/Login.razor.js /ops/Components/Pages/Login.razor.js',
  'reverse_proxy ops-proxy:8080'
)) {
  Assert-Contains -Name "Caddy Aspire login route" -Text $caddyfile -Expected $expected
}

$loginRouteIndex = $caddyfile.IndexOf('@ops-login-script path /Components/Pages/Login.razor.js')
$apiRouteIndex = $caddyfile.IndexOf('@api path /api/*')
if ($loginRouteIndex -lt 0 -or $apiRouteIndex -lt 0 -or $loginRouteIndex -ge $apiRouteIndex) {
  throw "The Aspire login script route must be evaluated before the back-office API route."
}

foreach ($expected in @(
  'location = /ops/Components/Pages/Login.razor.js',
  'sub_filter_types text/javascript;',
  "sub_filter `"fetch('/api/validatetoken'`" `"fetch('/ops/api/validatetoken'`";",
  "sub_filter '<base href=`"/`">' '<base href=`"/ops/`">';",
  'proxy_cookie_path / /ops/'
)) {
  Assert-Contains -Name "Aspire /ops adapter" -Text $opsProxy -Expected $expected
}

Write-Host "Aspire /ops login proxy contract passed."
