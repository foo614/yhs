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
  '@ops-theme-script path /js/app-theme.js',
  'uri replace /js/app-theme.js /ops/js/app-theme.js',
  '@ops-fluent-script path /_content/Microsoft.FluentUI.AspNetCore.Components/Microsoft.FluentUI.AspNetCore.Components.lib.module.js',
  'uri replace /_content/Microsoft.FluentUI.AspNetCore.Components/Microsoft.FluentUI.AspNetCore.Components.lib.module.js /ops/_content/Microsoft.FluentUI.AspNetCore.Components/Microsoft.FluentUI.AspNetCore.Components.lib.module.js',
  '@ops-metrics-scripts path /js/app-metrics.js /js/plotly-basic-2.35.2.min.js',
  '@ops-dashboard-route path /resources /resources/* /consolelogs /consolelogs/* /structuredlogs /structuredlogs/* /traces /traces/* /metrics /metrics/*',
  'rewrite * /ops{uri}',
  'reverse_proxy ops-proxy:8080'
)) {
  Assert-Contains -Name "Caddy Aspire dashboard route" -Text $caddyfile -Expected $expected
}

$loginRouteIndex = $caddyfile.IndexOf('@ops-login-script path /Components/Pages/Login.razor.js')
$dashboardRouteIndex = $caddyfile.IndexOf('@ops-dashboard-route path /resources')
$apiRouteIndex = $caddyfile.IndexOf('@api path /api/*')
$backOfficeFallbackIndex = $caddyfile.IndexOf('reverse_proxy backoffice:3001')
if ($loginRouteIndex -lt 0 -or $dashboardRouteIndex -lt 0 -or $apiRouteIndex -lt 0 -or $backOfficeFallbackIndex -lt 0 -or $loginRouteIndex -ge $apiRouteIndex -or $dashboardRouteIndex -ge $apiRouteIndex -or $loginRouteIndex -ge $backOfficeFallbackIndex -or $dashboardRouteIndex -ge $backOfficeFallbackIndex) {
  throw "The Aspire dashboard routes must be evaluated before the back-office API and fallback routes."
}

foreach ($assetRoute in @(
  '@ops-theme-script path /js/app-theme.js',
  '@ops-fluent-script path /_content/Microsoft.FluentUI.AspNetCore.Components/Microsoft.FluentUI.AspNetCore.Components.lib.module.js',
  '@ops-metrics-scripts path /js/app-metrics.js /js/plotly-basic-2.35.2.min.js'
)) {
  $assetRouteIndex = $caddyfile.IndexOf($assetRoute)
  if ($assetRouteIndex -lt 0 -or $assetRouteIndex -ge $apiRouteIndex -or $assetRouteIndex -ge $backOfficeFallbackIndex) {
    throw "The Aspire dashboard asset route must be evaluated before the back-office API and fallback routes: $assetRoute"
  }
}

$metricsAssetRoutePattern = '(?s)@ops-metrics-scripts path /js/app-metrics\.js /js/plotly-basic-2\.35\.2\.min\.js\s+handle @ops-metrics-scripts \{\s+rewrite \* /ops\{uri\}\s+reverse_proxy ops-proxy:8080\s+\}'
if (-not [regex]::IsMatch($caddyfile, $metricsAssetRoutePattern)) {
  throw "The Aspire metrics asset route must rebase both exact JavaScript paths through /ops."
}

foreach ($expected in @(
  'location = /ops/Components/Pages/Login.razor.js',
  'location = /ops/ops-subpath-navigation.js',
  'alias /usr/share/nginx/html/ops-subpath-navigation.js;',
  'sub_filter_types text/javascript;',
  "sub_filter `"fetch('/api/validatetoken'`" `"fetch('/ops/api/validatetoken'`";",
  "sub_filter '<base href=`"/`">' '<base href=`"/ops/`"><script src=`"/ops/ops-subpath-navigation.js`"></script>';",
  'proxy_set_header X-Forwarded-Proto https;',
  'proxy_redirect ~*^(?:https?://[^/]+)?/login\?returnUrl=%2f(.+)$ /ops/login?returnUrl=%2Fops%2F$1;',
  'proxy_cookie_path / /ops/'
)) {
  Assert-Contains -Name "Aspire /ops adapter" -Text $opsProxy -Expected $expected
}

$returnUrlRedirect = 'proxy_redirect ~*^(?:https?://[^/]+)?/login\?returnUrl=%2f(.+)$ /ops/login?returnUrl=%2Fops%2F$1;'
$firstReturnUrlRedirect = $opsProxy.IndexOf($returnUrlRedirect)
$firstGenericRedirect = $opsProxy.IndexOf('proxy_redirect ~^https?://[^/]+(/.*)$ /ops$1;')
if ($firstReturnUrlRedirect -lt 0 -or $firstGenericRedirect -lt 0 -or $firstReturnUrlRedirect -ge $firstGenericRedirect) {
  throw "The Aspire return URL rewrite must run before the generic /ops redirect rewrite."
}

if ([regex]::Matches($opsProxy, [regex]::Escape($returnUrlRedirect)).Count -ne 2) {
  throw "The Aspire return URL rewrite must protect both /ops proxy locations."
}

$loginRedirectPattern = '^(?:https?://[^/]+)?/login\?returnUrl=%2f(.+)$'
$rewrittenLoginLocation = [regex]::Replace(
  'http://production-dashboard:18888/login?returnUrl=%2Fstructuredlogs',
  $loginRedirectPattern,
  '/ops/login?returnUrl=%2Fops%2F$1',
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)
if ($rewrittenLoginLocation -ne '/ops/login?returnUrl=%2Fops%2Fstructuredlogs') {
  throw "The Aspire return URL rewrite must preserve /ops for an absolute upstream redirect."
}

& node (Join-Path $repoRoot "infra/test-ops-subpath-navigation.mjs")
if ($LASTEXITCODE -ne 0) {
  throw "The Aspire /ops subpath navigation adapter tests failed."
}

Write-Host "Aspire /ops login proxy contract passed."
