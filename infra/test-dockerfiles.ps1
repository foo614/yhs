param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

function Read-RequiredFile {
  param([string]$RelativePath)

  $path = Join-Path $repoRoot $RelativePath
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required Dockerfile is missing: $RelativePath"
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

function Assert-Order {
  param(
    [string]$Name,
    [string]$Text,
    [string[]]$Steps
  )

  $position = -1
  foreach ($step in $Steps) {
    $next = $Text.IndexOf($step, $position + 1, [System.StringComparison]::Ordinal)
    if ($next -lt 0) {
      throw "$Name is missing expected step: $step"
    }
    if ($next -le $position) {
      throw "$Name has steps out of order near: $step"
    }
    $position = $next
  }
}

$api = Read-RequiredFile "services/api/src/YSHeng.Api/Dockerfile"
$frontoffice = Read-RequiredFile "apps/frontoffice/Dockerfile"
$backoffice = Read-RequiredFile "apps/backoffice/Dockerfile"

Assert-Order -Name "API Dockerfile" -Text $api -Steps @(
  "FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build",
  "RUN dotnet restore services/api/src/YSHeng.Api/YSHeng.Api.csproj",
  "RUN dotnet publish services/api/src/YSHeng.Api/YSHeng.Api.csproj -c Release -o /app/publish",
  "FROM mcr.microsoft.com/dotnet/aspnet:10.0",
  "RUN apt-get update",
  "COPY --from=build /app/publish .",
  "EXPOSE 8080",
  'ENTRYPOINT ["dotnet", "YSHeng.Api.dll"]'
)
Assert-Contains -Name "API Dockerfile health dependency" -Text $api -Expected "apt-get install -y --no-install-recommends curl"

Assert-Order -Name "Front-office Dockerfile" -Text $frontoffice -Steps @(
  "FROM node:25-alpine AS deps",
  "RUN npm install --workspace apps/frontoffice",
  "FROM node:25-alpine AS build",
  "ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:5000",
  'ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL',
  "RUN npm run build",
  "WORKDIR /app/apps/frontoffice",
  "ENV NODE_ENV=production",
  "ENV PORT=3000",
  "EXPOSE 3000",
  'CMD ["node", "apps/frontoffice/server.js"]'
)
Assert-Contains -Name "Front-office standalone output" -Text $frontoffice -Expected "COPY --from=build /app/apps/frontoffice/.next/standalone ./"
Assert-Contains -Name "Front-office static assets" -Text $frontoffice -Expected "COPY --from=build /app/apps/frontoffice/.next/static ./apps/frontoffice/.next/static"
Assert-Contains -Name "Front-office public assets" -Text $frontoffice -Expected "COPY --from=build /app/apps/frontoffice/public ./apps/frontoffice/public"

Assert-Order -Name "Back-office Dockerfile" -Text $backoffice -Steps @(
  "FROM node:25-alpine AS deps",
  "RUN npm install --workspace apps/backoffice",
  "FROM node:25-alpine AS build",
  "ARG VITE_API_BASE_URL=http://localhost:5000",
  'ENV VITE_API_BASE_URL=$VITE_API_BASE_URL',
  "RUN npm run build",
  "WORKDIR /app/apps/backoffice",
  "RUN npm install -g serve",
  "COPY --from=build /app/apps/backoffice/dist ./dist",
  "EXPOSE 3001",
  'CMD ["serve", "-s", "dist", "-l", "3001"]'
)

Write-Host "Dockerfile contract tests passed."
