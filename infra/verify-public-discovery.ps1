param(
  [string]$BaseUrl = "https://ysheng.com.my",
  [int]$TimeoutSeconds = 20,
  [switch]$SkipGuidePages
)

$ErrorActionPreference = "Stop"
$base = $BaseUrl.TrimEnd("/")
$guidePaths = @(
  "/used-cars-kluang",
  "/used-cars-under-rm30000",
  "/car-loan-kluang",
  "/trade-in-car-kluang"
)

function Get-PublicPage {
  param([string]$Path)

  $url = "$base$Path"
  $response = Invoke-WebRequest `
    -Uri $url `
    -UseBasicParsing `
    -Headers @{ "User-Agent" = "YS-Heng-Public-Discovery-Check/1.0" } `
    -TimeoutSec $TimeoutSeconds

  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
    throw "$url returned HTTP $($response.StatusCode)"
  }

  return $response
}

function Assert-Contains {
  param(
    [string]$Content,
    [string]$Expected,
    [string]$Label
  )

  if (-not $Content.Contains($Expected)) {
    throw "$Label did not contain expected value: $Expected"
  }
}

$homePage = Get-PublicPage "/"
Assert-Contains $homePage.Content '<link rel="canonical" href="' "Home canonical"
Assert-Contains $homePage.Content 'property="og:title"' "Home Open Graph metadata"
Assert-Contains $homePage.Content 'property="og:image"' "Home Open Graph image"
Assert-Contains $homePage.Content '"@type":"AutoDealer"' "Home AutoDealer structured data"

$robots = Get-PublicPage "/robots.txt"
Assert-Contains $robots.Content "OAI-SearchBot" "robots.txt"
Assert-Contains $robots.Content "$base/sitemap.xml" "robots.txt sitemap"

$sitemap = Get-PublicPage "/sitemap.xml"
foreach ($path in @("/", "/vehicles", "/contact")) {
  Assert-Contains $sitemap.Content "$base$path" "Sitemap"
}

if (-not $SkipGuidePages) {
  foreach ($path in $guidePaths) {
    $page = Get-PublicPage $path
    Assert-Contains $page.Content "<title>" "$path title"
    Assert-Contains $page.Content ('<link rel="canonical" href="{0}{1}"' -f $base, $path) "$path canonical"
    Assert-Contains $page.Content '"@type":"WebPage"' "$path structured data"
    Assert-Contains $sitemap.Content "$base$path" "Sitemap"
  }
}

[PSCustomObject]@{
  BaseUrl = $base
  CheckedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  Home = "OK"
  Robots = "OK"
  Sitemap = "OK"
  GuidePages = if ($SkipGuidePages) { "Skipped" } else { "OK ($($guidePaths.Count))" }
} | Format-List

Write-Host "Public SEO/GEO discovery checks passed."
