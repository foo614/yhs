param(
  [switch]$SkipBuild,
  [switch]$SkipSmoke
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Name"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

Invoke-Step "Type-check web apps" { npm run lint }
Invoke-Step "Front-office tests" { npm --workspace apps/frontoffice run test }
Invoke-Step "Back-office tests" { npm --workspace apps/backoffice run test }
Invoke-Step "Backend tests" { dotnet test services\api\YSHeng.sln }
Invoke-Step "Dockerfile contract tests" { & .\infra\test-dockerfiles.ps1 }
Invoke-Step "Docker Compose contract tests" { & .\infra\test-compose-contract.ps1 }
Invoke-Step "Compose environment validation tests" { & .\infra\test-compose-env.ps1 }
Invoke-Step "Deployment script contract tests" { & .\infra\test-deployment-scripts.ps1 }
Invoke-Step "Deployment runbook tests" { & .\infra\test-deployment-runbook.ps1 }
Invoke-Step "Source requirements crosscheck tests" { & .\infra\test-source-requirements-crosscheck.ps1 }
Invoke-Step "Stitch visual reference handoff tests" { & .\infra\test-stitch-reference-handoff.ps1 }

if (-not $SkipBuild) {
  Invoke-Step "Build web apps" { npm run build }
}

if (-not $SkipSmoke) {
  Invoke-Step "Clean local stack smoke" { & .\infra\local-clean-smoke.ps1 }
}

Write-Host ""
Write-Host "YS Heng local verification passed."
