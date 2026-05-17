param(
  [switch]$Clean
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$SidecarDir = Join-Path $RepoRoot "services\data-sidecar"
$VenvDir = Join-Path $SidecarDir ".venv-build"
$DistDir = Join-Path $SidecarDir "dist"
$BuildDir = Join-Path $SidecarDir "build"
$Entry = Join-Path $SidecarDir "main.py"
$BundleDir = Join-Path $DistDir "value-copilot-sidecar"
$Exe = Join-Path $BundleDir "value-copilot-sidecar.exe"

function Remove-WithRetry($Path) {
  if (-not (Test-Path $Path)) {
    return
  }
  for ($i = 0; $i -lt 12; $i++) {
    try {
      Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
      return
    } catch {
      if ($i -eq 11) {
        throw
      }
      Start-Sleep -Seconds 2
    }
  }
}

function Remove-DirWithRetry($Path) {
  if (-not (Test-Path $Path)) {
    return
  }
  for ($i = 0; $i -lt 12; $i++) {
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      return
    } catch {
      if ($i -eq 11) {
        throw
      }
      Start-Sleep -Seconds 2
    }
  }
}

if ($Clean) {
  Remove-Item -LiteralPath $VenvDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $BuildDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-DirWithRetry $BundleDir
  Remove-WithRetry (Join-Path $DistDir "value-copilot-sidecar.exe")
}

if (-not (Test-Path $Entry)) {
  throw "Sidecar entry not found: $Entry"
}

New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
Remove-DirWithRetry $BundleDir
Remove-WithRetry (Join-Path $DistDir "value-copilot-sidecar.exe")

if (-not (Test-Path $VenvDir)) {
  python -m venv $VenvDir
}

$Python = Join-Path $VenvDir "Scripts\python.exe"
if (-not (Test-Path $Python)) {
  throw "Python venv was not created correctly: $Python"
}

& $Python -m pip install --upgrade pip
& $Python -m pip install -r (Join-Path $SidecarDir "requirements.txt") pyinstaller

Push-Location $SidecarDir
try {
  & $Python -m PyInstaller `
    --clean `
    --collect-data "akshare" `
    --name "value-copilot-sidecar" `
    --distpath $DistDir `
    --workpath $BuildDir `
    $Entry
} finally {
  Pop-Location
}

if (-not (Test-Path $Exe)) {
  throw "Sidecar executable was not produced: $Exe"
}

Write-Host "Built sidecar: $Exe"
