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

function Assert-NotContains {
  param(
    [string]$Content,
    [string]$Unexpected,
    [string]$Label
  )

  if ($Content.Contains($Unexpected)) {
    throw "$Label contained unsupported value: $Unexpected"
  }
}

$homePage = Get-PublicPage "/"
Assert-Contains $homePage.Content '<link rel="canonical" href="' "Home canonical"
Assert-Contains $homePage.Content 'property="og:title"' "Home Open Graph metadata"
Assert-Contains $homePage.Content 'property="og:image"' "Home Open Graph image"
Assert-Contains $homePage.Content '"@type":"AutoDealer"' "Home AutoDealer structured data"
Assert-Contains $homePage.Content 'YS HENG AUTOMOTIVE SDN BHD' "Home official business identity"
Assert-NotContains $homePage.Content '500+ Reviews' "Home review evidence"

$contactPage = Get-PublicPage "/contact"
Assert-Contains $contactPage.Content 'YS HENG AUTOMOTIVE SDN BHD' "Contact official business identity"
Assert-NotContains $contactPage.Content 'Not yet rated (4 reviews)' "Contact review evidence"

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
    Assert-Contains $page.Content '"@type":"FAQPage"' "$path FAQ structured data"
    Assert-Contains $page.Content '"@type":"BreadcrumbList"' "$path breadcrumb structured data"
    Assert-Contains $page.Content 'Last updated' "$path visible update date"
    Assert-Contains $sitemap.Content "$base$path" "Sitemap"
  }
}

[PSCustomObject]@{
  BaseUrl = $base
  CheckedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  Home = "OK"
  Contact = "OK"
  Robots = "OK"
  Sitemap = "OK"
  GuidePages = if ($SkipGuidePages) { "Skipped" } else { "OK ($($guidePaths.Count))" }
} | Format-List

Write-Host "Public SEO/GEO discovery checks passed."
