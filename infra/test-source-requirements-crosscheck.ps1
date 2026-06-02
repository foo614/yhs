param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$crosscheckPath = Join-Path $repoRoot "docs/SOURCE_REQUIREMENTS_CROSSCHECK.md"

if (-not (Test-Path -LiteralPath $crosscheckPath)) {
  throw "Source requirements crosscheck is missing: docs/SOURCE_REQUIREMENTS_CROSSCHECK.md"
}

$text = Get-Content -LiteralPath $crosscheckPath -Raw

function Assert-Contains {
  param(
    [string]$Expected
  )

  if (-not $text.Contains($Expected)) {
    throw "Source requirements crosscheck is missing expected text: $Expected"
  }
}

foreach ($sourceName in @(
  "YS_Heng_Complete_Requirement_Analysis_CN.docx",
  "YSHeng Portal.docx"
)) {
  Assert-Contains $sourceName
}

foreach ($term in @(
  "Website plus internal portal",
  "Upload to website / inventory sync",
  "Purchase invoice",
  "Customer details, IC, status receipt",
  "Vehicle details, VOC, AP, photo, status",
  "Available / Loan Processing / Sold",
  "Boss Confirm / Contra range price",
  "UCD status tracking",
  "Outstation pickup allowance, schedule, booking slip",
  "Loan edit, submit, follow-up, 3-day reminder, LOU, upload document",
  "Delivery booking inspection, schedule, PIC, notification, inspection, prepare document, report",
  "Polish, tinted, wash, final checklist",
  "Insurance, road tax, windscreen insurance",
  "Bank prepare document, checklist, invoice generation, payment follow-up, Pending/Approve/Disbursed, AutoCount key-in, nett price",
  "Car settlement owner, deadline, amount reminder",
  "Supplier/refurbishment duplicate invoice, wrong plate, supplier multi-invoice checks, costs by plate, profit deduction",
  "Broker commission, car plate profit, CP58",
  "Daily spend, electric bill, monthly 15th reminder",
  "Salary: working day, leave, MC, attendance, AL/MC control, pay slip",
  "Debt recovery status, balance reminder, follow-up",
  "Dashboard: total stock, total profit, pending loan, outstanding payment, settlement due, top supplier, sales performance, vehicle aging",
  "AI OCR, loan eligibility prediction, photo optimization, profit prediction, WhatsApp, AutoCount integration"
)) {
  Assert-Contains $term
}

foreach ($evidenceDoc in @(
  "docs/API.md",
  "docs/IMPLEMENTATION.md",
  "docs/REQUIREMENTS_TRACE.md",
  ".\infra\verify-local.ps1"
)) {
  Assert-Contains $evidenceDoc
}

Write-Host "Source requirements crosscheck tests passed."
