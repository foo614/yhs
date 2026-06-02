param(
  [int]$PostgresPort = 57432,
  [int]$ApiPort = 5600,
  [int]$FrontOfficePort = 3500,
  [int]$BackOfficePort = 3501,
  [string]$PostgresBin = "C:\Program Files\PostgreSQL\17\bin",
  [string]$AdminEmail = "admin@ysheng.local",
  [string]$AdminPassword = "ChangeMe123!"
)

$ErrorActionPreference = "Stop"

function Assert-CommandPath {
  param([string]$Path, [string]$Name)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Name not found at $Path"
  }
}

function Assert-PortFree {
  param([int]$Port)
  $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if ($listeners.Count -gt 0) {
    $owners = ($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ","
    throw "Port $Port is already in use by process id(s): $owners"
  }
}

function Wait-HttpOk {
  param([string]$Url, [int]$TimeoutSeconds = 90)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        return
      }
    }
    catch {
      Start-Sleep -Seconds 2
    }
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for $Url"
}

function Start-HiddenPowerShell {
  param(
    [string]$Script,
    [string]$OutLog,
    [string]$ErrLog
  )
  Start-Process `
    -FilePath "powershell" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $Script) `
    -WorkingDirectory (Get-Location) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -PassThru
}

function Invoke-NativeCommand {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [hashtable]$Environment = @{},
    [int]$TimeoutSeconds = 60
  )

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "ysheng-local-smoke"
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  $id = [guid]::NewGuid().ToString("N")
  $stdout = Join-Path $tempRoot "$id.out.log"
  $stderr = Join-Path $tempRoot "$id.err.log"

  $previousEnvironment = @{}
  try {
    foreach ($entry in $Environment.GetEnumerator()) {
      $previousEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, "Process")
      [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, "Process")
    }

    $process = Start-Process `
      -FilePath $FilePath `
      -ArgumentList $Arguments `
      -WorkingDirectory (Get-Location) `
      -WindowStyle Hidden `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr `
      -PassThru

    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      throw "$FilePath timed out after $TimeoutSeconds seconds. StdOut: $(Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue) StdErr: $(Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue)"
    }

    $process.Refresh()
    if ($null -ne $process.ExitCode -and $process.ExitCode -ne 0) {
      throw "$FilePath failed with exit code $($process.ExitCode). StdOut: $(Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue) StdErr: $(Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue)"
    }
  }
  finally {
    foreach ($entry in $previousEnvironment.GetEnumerator()) {
      [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
    }
  }
}

$initDb = Join-Path $PostgresBin "initdb.exe"
$pgCtl = Join-Path $PostgresBin "pg_ctl.exe"
$postgres = Join-Path $PostgresBin "postgres.exe"
$createdb = Join-Path $PostgresBin "createdb.exe"
$psql = Join-Path $PostgresBin "psql.exe"
Assert-CommandPath $initDb "initdb"
Assert-CommandPath $pgCtl "pg_ctl"
Assert-CommandPath $postgres "postgres"
Assert-CommandPath $createdb "createdb"
Assert-CommandPath $psql "psql"

Assert-PortFree $PostgresPort
Assert-PortFree $ApiPort
Assert-PortFree $FrontOfficePort
Assert-PortFree $BackOfficePort

$root = (Get-Location).Path
$artifactRoot = Join-Path ([System.IO.Path]::GetTempPath()) "ysheng-local-clean-smoke"
$dataDir = Join-Path $artifactRoot "pg-data"
$pgLog = Join-Path $artifactRoot "postgres.out.log"
$pgErrLog = Join-Path $artifactRoot "postgres.err.log"
$pwFile = Join-Path $artifactRoot "postgres.pw"
$apiOutLog = Join-Path $artifactRoot "api.out.log"
$apiErrLog = Join-Path $artifactRoot "api.err.log"
$frontOutLog = Join-Path $artifactRoot "frontoffice.out.log"
$frontErrLog = Join-Path $artifactRoot "frontoffice.err.log"
$backOutLog = Join-Path $artifactRoot "backoffice.out.log"
$backErrLog = Join-Path $artifactRoot "backoffice.err.log"
$postgresProcess = $null
$apiProcess = $null
$frontProcess = $null
$backProcess = $null

try {
  Write-Host "Preparing clean temporary PostgreSQL data directory..."
  New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null
  Write-Host "Local clean smoke artifacts: $artifactRoot"
  if (Test-Path -LiteralPath $dataDir) {
    if (Test-Path -LiteralPath (Join-Path $dataDir "postmaster.pid")) {
      & $pgCtl -D $dataDir stop -m fast *> $null
    }
    Remove-Item -LiteralPath $dataDir -Recurse -Force
  }
  Remove-Item -LiteralPath $pgLog, $pgErrLog, $pwFile, $apiOutLog, $apiErrLog, $frontOutLog, $frontErrLog, $backOutLog, $backErrLog -ErrorAction SilentlyContinue

  Set-Content -LiteralPath $pwFile -Value "ysheng_dev" -NoNewline
  Write-Host "Initializing PostgreSQL..."
  Invoke-NativeCommand $initDb @("-D", $dataDir, "-U", "ysheng", "--pwfile=$pwFile", "--auth=scram-sha-256", "--encoding=UTF8") @{} 90
  Write-Host "Starting PostgreSQL on port $PostgresPort..."
  $postgresProcess = Start-Process `
    -FilePath $postgres `
    -ArgumentList @("-D", $dataDir, "-p", "$PostgresPort") `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $pgLog `
    -RedirectStandardError $pgErrLog `
    -PassThru

  $deadline = (Get-Date).AddSeconds(60)
  do {
    if ($postgresProcess.HasExited) {
      throw "PostgreSQL exited during startup. $(Get-Content -LiteralPath $pgLog -Raw -ErrorAction SilentlyContinue) $(Get-Content -LiteralPath $pgErrLog -Raw -ErrorAction SilentlyContinue)"
    }
    $listeners = @(Get-NetTCPConnection -LocalPort $PostgresPort -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -gt 0) {
      break
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)

  if (@(Get-NetTCPConnection -LocalPort $PostgresPort -State Listen -ErrorAction SilentlyContinue).Count -eq 0) {
    throw "Timed out waiting for PostgreSQL on port $PostgresPort"
  }

  Write-Host "Creating clean smoke database..."
  Invoke-NativeCommand $createdb @("-h", "localhost", "-p", "$PostgresPort", "-U", "ysheng", "ysheng") @{ PGPASSWORD = "ysheng_dev" } 60
  Invoke-NativeCommand $psql @("-h", "localhost", "-p", "$PostgresPort", "-U", "ysheng", "-d", "ysheng", "-c", "select current_user, current_database();") @{ PGPASSWORD = "ysheng_dev" } 60

  $apiUrl = "http://localhost:$ApiPort"
  $frontUrl = "http://localhost:$FrontOfficePort"
  $backUrl = "http://localhost:$BackOfficePort"
  $connectionString = "Host=localhost;Port=$PostgresPort;Database=ysheng;Username=ysheng;Password=ysheng_dev"

  $apiScript = @"
`$env:ASPNETCORE_ENVIRONMENT='Production'
`$env:ASPNETCORE_URLS='$apiUrl'
`$env:ConnectionStrings__Default='$connectionString'
`$env:AllowedOrigins__0='$frontUrl'
`$env:AllowedOrigins__1='$backUrl'
`$env:SeedData__Enabled='true'
`$env:SeedAdmin__Email='$AdminEmail'
`$env:SeedAdmin__Password='$AdminPassword'
`$env:Worker__Enabled='false'
dotnet run --project services/api/src/YSHeng.Api/YSHeng.Api.csproj
"@
  $frontScript = @"
`$env:NEXT_PUBLIC_API_BASE_URL='$apiUrl'
& 'C:\Program Files\nodejs\npm.cmd' --workspace apps/frontoffice exec next start -- -p $FrontOfficePort
"@
  $backScript = @"
`$env:VITE_API_BASE_URL='$apiUrl'
& 'C:\Program Files\nodejs\npm.cmd' --workspace apps/backoffice exec vite preview -- --host 0.0.0.0 --port $BackOfficePort
"@

  Write-Host "Starting API on $apiUrl..."
  $apiProcess = Start-HiddenPowerShell $apiScript $apiOutLog $apiErrLog
  Write-Host "Starting front office on $frontUrl..."
  $frontProcess = Start-HiddenPowerShell $frontScript $frontOutLog $frontErrLog
  Write-Host "Starting back office on $backUrl..."
  $backProcess = Start-HiddenPowerShell $backScript $backOutLog $backErrLog

  Write-Host "Waiting for local clean stack..."
  Wait-HttpOk "$apiUrl/health/ready" 120
  Wait-HttpOk $frontUrl 120
  Wait-HttpOk $backUrl 120

  Write-Host "Running smoke test against local clean stack..."
  & (Join-Path $root "infra/smoke-test.ps1") `
    -ApiBaseUrl $apiUrl `
    -FrontOfficeUrl $frontUrl `
    -BackOfficeUrl $backUrl `
    -AdminEmail $AdminEmail `
    -AdminPassword $AdminPassword
}
finally {
  if ($apiProcess -and $apiProcess.HasExited) {
    Write-Host "API process exited early. Output:"
    Get-Content -LiteralPath $apiOutLog -Tail 80 -ErrorAction SilentlyContinue
    Get-Content -LiteralPath $apiErrLog -Tail 80 -ErrorAction SilentlyContinue
  }
  if ($frontProcess -and $frontProcess.HasExited) {
    Write-Host "Front office process exited early. Output:"
    Get-Content -LiteralPath $frontOutLog -Tail 80 -ErrorAction SilentlyContinue
    Get-Content -LiteralPath $frontErrLog -Tail 80 -ErrorAction SilentlyContinue
  }
  if ($backProcess -and $backProcess.HasExited) {
    Write-Host "Back office process exited early. Output:"
    Get-Content -LiteralPath $backOutLog -Tail 80 -ErrorAction SilentlyContinue
    Get-Content -LiteralPath $backErrLog -Tail 80 -ErrorAction SilentlyContinue
  }
  Write-Host "Stopping local clean smoke services..."
  foreach ($process in @($apiProcess, $frontProcess, $backProcess)) {
    if ($null -ne $process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }

  $ownedPorts = @($ApiPort, $FrontOfficePort, $BackOfficePort)
  foreach ($port in $ownedPorts) {
    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
      Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }

  if (Test-Path -LiteralPath (Join-Path $dataDir "postmaster.pid")) {
    & $pgCtl -D $dataDir stop -m fast *> $null
  }
  if ($postgresProcess -and -not $postgresProcess.HasExited) {
    Stop-Process -Id $postgresProcess.Id -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $pwFile -ErrorAction SilentlyContinue
}
