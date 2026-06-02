param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$tracePath = Join-Path $repoRoot "docs/REQUIREMENTS_TRACE.md"

if (-not (Test-Path -LiteralPath $tracePath)) {
  throw "Requirements trace is missing: docs/REQUIREMENTS_TRACE.md"
}

$text = Get-Content -LiteralPath $tracePath -Raw

foreach ($expected in @(
  "React public front office",
  "React back office with Ant Design Pro style",
  "Google Stitch visual reference",
  ".NET 10 API",
  "PostgreSQL persistence",
  "Docker/VPS deployment shape",
  "Deployment runbook",
  "GitHub CI verification",
  "Available vehicle inventory",
  "Public lead/enquiry capture",
  "Hide sold/non-public/internal data",
  "Vehicle photos/thumbnails",
  "English/Chinese public UI",
  "Dashboard",
  "Vehicles/intake",
  "Repairs/refurbishment",
  "Loan workflow",
  "Delivery workflow",
  "Finance/payment tracking",
  "Leads triage",
  "Audit log",
  "Admin users/roles",
  "HR/Salary",
  "ASP.NET Identity auth",
  "Role/policy authorization",
  "Credentialed CORS for back office",
  "Defensive API response headers",
  "PostgreSQL blob storage",
  "Thumbnail generation",
  "Upload size limits",
  "Rules-based reminders",
  "Workflow validations/status changes",
  "OCR/AI/WhatsApp/AutoCount",
  "Deployment runbook tests: passed.",
  "Requirements trace tests: passed.",
  'GitHub Actions CI run `26806881673`: passed on `main` commit `a24cf5e`.',
  "Docker Desktop service com.docker.service is Stopped."
)) {
  if (-not $text.Contains($expected)) {
    throw "Requirements trace is missing expected text: $expected"
  }
}

Write-Host "Requirements trace tests passed."
