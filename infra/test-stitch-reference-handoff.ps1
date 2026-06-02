param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$handoffPath = Join-Path $repoRoot "docs/STITCH_VISUAL_REFERENCE.md"

if (-not (Test-Path -LiteralPath $handoffPath)) {
  throw "Stitch visual reference handoff is missing: docs/STITCH_VISUAL_REFERENCE.md"
}

$text = Get-Content -LiteralPath $handoffPath -Raw

foreach ($expected in @(
  "https://stitch.withgoogle.com/projects/5674326425334870589",
  "Stitch - Projects",
  "APPCOMPANION-ROOT",
  "No inspectable screen names, components, images, colors, layout measurements, or export assets",
  "Assets Needed For Exact Matching",
  "Current MVP Visual Direction",
  "Verification Boundary",
  ".\infra\verify-local.ps1",
  "visual regression checks or browser screenshot comparisons"
)) {
  if (-not $text.Contains($expected)) {
    throw "Stitch visual reference handoff is missing expected text: $expected"
  }
}

Write-Host "Stitch visual reference handoff tests passed."
