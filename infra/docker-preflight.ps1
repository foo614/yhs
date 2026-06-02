param(
  [int]$TimeoutSeconds = 20,
  [int[]]$Ports = @(3000, 3001, 5000, 5432),
  [string]$EnvPath = ".env",
  [switch]$SkipEnvValidation,
  [switch]$AllowExampleEnvValues
)

$ErrorActionPreference = "Stop"

function Read-BoundedCommandText {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return ""
  }

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -eq 0) {
    return ""
  }

  $utf8 = [System.Text.Encoding]::UTF8.GetString($bytes)
  if ($utf8.Contains([string][char]0)) {
    return [System.Text.Encoding]::Unicode.GetString($bytes).TrimEnd([char]0)
  }

  return $utf8
}

function Invoke-BoundedCommand {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [int]$TimeoutSeconds
  )

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "ysheng-docker-preflight"
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  $id = [guid]::NewGuid().ToString("N")
  $stdout = Join-Path $tempRoot "$id.out.log"
  $stderr = Join-Path $tempRoot "$id.err.log"

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
    return [pscustomobject]@{
      TimedOut = $true
      ExitCode = $null
      StdOut = (Read-BoundedCommandText $stdout)
      StdErr = (Read-BoundedCommandText $stderr)
    }
  }

  $process.Refresh()
  return [pscustomobject]@{
    TimedOut = $false
    ExitCode = $process.ExitCode
    StdOut = (Read-BoundedCommandText $stdout)
    StdErr = (Read-BoundedCommandText $stderr)
  }
}

function Write-DockerDesktopDiagnostics {
  Write-Host "Docker diagnostics:"

  $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
  if ($dockerCommand) {
    Write-Host "  docker CLI: $($dockerCommand.Source)"
  }
  else {
    Write-Host "  docker CLI: not found on PATH"
  }

  $contextResult = Invoke-BoundedCommand -FilePath "docker" -Arguments @("context", "show") -TimeoutSeconds 5
  if (-not $contextResult.TimedOut -and $contextResult.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($contextResult.StdOut)) {
    Write-Host "  docker context: $($contextResult.StdOut.Trim())"
  }
  elseif ($contextResult.TimedOut) {
    Write-Host "  docker context: timed out"
  }
  else {
    $contextDetails = @($contextResult.StdErr, $contextResult.StdOut) -join " "
    Write-Host "  docker context: unavailable $($contextDetails.Trim())"
  }

  if ($IsWindows -or $env:OS -eq "Windows_NT") {
    $desktopProcesses = @(Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue)
    $service = Get-Service -Name "com.docker.service" -ErrorAction SilentlyContinue
    $wslCommand = Get-Command wsl -ErrorAction SilentlyContinue

    Write-Host "  Docker Desktop process count: $($desktopProcesses.Count)"
    if ($service) {
      Write-Host "  com.docker.service status: $($service.Status)"
    }
    else {
      Write-Host "  com.docker.service status: not found"
    }

    if ($wslCommand) {
      $wslResult = Invoke-BoundedCommand -FilePath "wsl" -Arguments @("-l", "-v") -TimeoutSeconds 10
      if (-not $wslResult.TimedOut -and -not [string]::IsNullOrWhiteSpace($wslResult.StdOut)) {
        $wslLines = ($wslResult.StdOut -split "\r?\n") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
        foreach ($line in $wslLines) {
          Write-Host "  WSL: $($line.Trim())"
        }
        if ($null -ne $wslResult.ExitCode -and $wslResult.ExitCode -ne 0) {
          Write-Host "  WSL exit code: $($wslResult.ExitCode)"
        }
      }
      elseif ($wslResult.TimedOut) {
        Write-Host "  WSL: distro listing timed out"
      }
      else {
        $wslDetails = @($wslResult.StdErr, $wslResult.StdOut) -join " "
        Write-Host "  WSL: unavailable $($wslDetails.Trim())"
      }
    }
    else {
      Write-Host "  WSL: wsl.exe not found"
    }
  }

  Write-Host "Start Docker Desktop and confirm the Linux engine is running, then rerun this preflight."
}

function Assert-DockerDesktopServiceReady {
  if (-not ($IsWindows -or $env:OS -eq "Windows_NT")) {
    return
  }

  $service = Get-Service -Name "com.docker.service" -ErrorAction SilentlyContinue
  if ($service -and $service.Status -ne "Running") {
    Write-DockerDesktopDiagnostics
    throw "Docker Desktop service com.docker.service is $($service.Status). Start Docker Desktop with the Linux engine enabled, or start the Docker Desktop Service from an elevated shell, then rerun this preflight."
  }
}

function Assert-DockerCommand {
  param(
    [string]$Name,
    [string[]]$Arguments
  )

  $result = Invoke-BoundedCommand -FilePath "docker" -Arguments $Arguments -TimeoutSeconds $TimeoutSeconds
  if ($result.TimedOut) {
    Write-DockerDesktopDiagnostics
    throw "$Name timed out after $TimeoutSeconds seconds. Docker Desktop or the Linux engine is not responding."
  }
  if ($result.ExitCode -ne 0) {
    $details = @($result.StdErr, $result.StdOut) -join "`n"
    throw "$Name failed with exit code $($result.ExitCode). $details"
  }
  Write-Host "$Name OK"
  if ($result.StdOut) {
    Write-Host $result.StdOut.Trim()
  }
}

Write-Host "Checking Dockerfiles..."
& (Join-Path (Get-Location) "infra/test-dockerfiles.ps1")

Write-Host "Checking Docker Compose contract..."
& (Join-Path (Get-Location) "infra/test-compose-contract.ps1")

Write-Host "Checking Docker engine..."
Write-Host "Checking Docker Desktop service..."
Assert-DockerDesktopServiceReady
Assert-DockerCommand "Docker server version" @("version", "--format", "{{.Server.Version}}")

if (-not $SkipEnvValidation) {
  if (Test-Path -LiteralPath $EnvPath) {
    Write-Host "Checking Compose environment..."
    $validationArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "infra/validate-compose-env.ps1", "-EnvPath", $EnvPath)
    if ($AllowExampleEnvValues) {
      $validationArgs += "-AllowExampleValues"
    }
    $result = Invoke-BoundedCommand -FilePath "powershell" -Arguments $validationArgs -TimeoutSeconds $TimeoutSeconds
    if ($result.TimedOut) {
      throw "Compose environment validation timed out after $TimeoutSeconds seconds."
    }
    if ($result.ExitCode -ne 0) {
      $details = @($result.StdErr, $result.StdOut) -join "`n"
      throw "Compose environment validation failed. $details"
    }
    Write-Host $result.StdOut.Trim()
  }
  else {
    Write-Host "No $EnvPath file found. Copy infra/compose.env.example to $EnvPath and edit it before VPS deployment."
  }
}

Write-Host "Checking Docker Compose..."
Assert-DockerCommand "Docker Compose config" @("compose", "-f", "infra/docker-compose.yml", "config", "--quiet")

$blockedPorts = @()
foreach ($port in $Ports) {
  $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  if ($listeners.Count -gt 0) {
    $blockedPorts += [pscustomobject]@{
      Port = $port
      Processes = ($listeners | Select-Object -ExpandProperty OwningProcess -Unique) -join ","
    }
  }
}

if ($blockedPorts.Count -gt 0) {
  Write-Host "Port conflicts found:"
  $blockedPorts | Format-Table -AutoSize
  Write-Host "Use POSTGRES_PORT, API_PORT, FRONTOFFICE_PORT, and BACKOFFICE_PORT overrides before running compose."
}
else {
  Write-Host "Default compose ports are free."
}

Write-Host "Docker preflight completed."
