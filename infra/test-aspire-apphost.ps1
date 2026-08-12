param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

function Read-Text {
  param([string]$RelativePath)

  $path = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required Aspire source file is missing: $RelativePath"
  }
  return Get-Content -LiteralPath $path -Raw
}

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

$tools = Read-Text ".config/dotnet-tools.json"
$appHostProject = Read-Text "services/api/src/YSHeng.AppHost/YSHeng.AppHost.csproj"
$appHost = Read-Text "services/api/src/YSHeng.AppHost/AppHost.cs"
$serviceDefaultsProject = Read-Text "services/api/src/YSHeng.ServiceDefaults/YSHeng.ServiceDefaults.csproj"
$serviceDefaults = Read-Text "services/api/src/YSHeng.ServiceDefaults/Extensions.cs"
$apiProject = Read-Text "services/api/src/YSHeng.Api/YSHeng.Api.csproj"
$apiProgram = Read-Text "services/api/src/YSHeng.Api/Program.cs"
$solution = Read-Text "services/api/YSHeng.sln"

Assert-Contains -Name "Pinned Aspire CLI" -Text $tools -Expected '"version": "13.4.6"'
foreach ($expected in @(
  'Sdk="Aspire.AppHost.Sdk/13.4.6"',
  'PackageReference Include="Aspire.Hosting.AppHost" Version="13.4.6"',
  'PackageReference Include="Aspire.Hosting.Docker" Version="13.4.6"',
  'PackageReference Include="Aspire.Hosting.PostgreSQL" Version="13.4.6"'
)) {
  Assert-Contains -Name "Aspire AppHost project" -Text $appHostProject -Expected $expected
}

foreach ($expected in @(
  'AddDockerComposeEnvironment("production")',
  '.WithDashboard(dashboard => dashboard',
  '.WithHostPort(null)',
  '.WithForwardedHeaders(true)',
  'AddPostgres("postgres"',
  '.WithImageTag("17")',
  '.WithDataVolume("postgres_data")',
  '.WithEnvironment("POSTGRES_DB", "ysheng")',
  'AddDatabase("ysheng")',
  'AddDockerfile("api", "../../../..", "services/api/src/YSHeng.Api/Dockerfile")',
  'AddDockerfile("worker", "../../../..", "services/api/src/YSHeng.Api/Dockerfile")',
  'AddDockerfile("frontoffice", "../../../..", "apps/frontoffice/Dockerfile")',
  'AddDockerfile("backoffice", "../../../..", "apps/backoffice/Dockerfile")',
  '.WithReference(database, "Default")',
  '.WithEnvironment("SeedData__Enabled", "false")',
  '.WithHttpHealthCheck("/health/ready")'
)) {
  Assert-Contains -Name "Aspire AppHost" -Text $appHost -Expected $expected
}

Assert-Contains -Name "Service defaults project" -Text $serviceDefaultsProject -Expected '<IsAspireSharedProject>true</IsAspireSharedProject>'
foreach ($expected in @(
  'AddServiceDefaults',
  'AddServiceDiscovery',
  'AddStandardResilienceHandler',
  'AddOpenTelemetry',
  'OTEL_EXPORTER_OTLP_ENDPOINT'
)) {
  Assert-Contains -Name "Service defaults" -Text $serviceDefaults -Expected $expected
}
if ($serviceDefaults.Contains("MapDefaultEndpoints")) {
  throw "Service defaults must not map health endpoints that conflict with the API's existing health contract."
}

Assert-Contains -Name "API project" -Text $apiProject -Expected 'ProjectReference Include="..\YSHeng.ServiceDefaults\YSHeng.ServiceDefaults.csproj"'
Assert-Contains -Name "API startup" -Text $apiProgram -Expected 'builder.AddServiceDefaults();'
Assert-Contains -Name "Solution" -Text $solution -Expected 'YSHeng.AppHost'
Assert-Contains -Name "Solution" -Text $solution -Expected 'YSHeng.ServiceDefaults'

Write-Host "Aspire AppHost contract tests passed."
