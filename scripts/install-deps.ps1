# Responsibility: bring an installed Motion Studio folder's packages up to date (npm for the app, the render engine and ava-farsi; Chromium; Python packages) and put the starter files in place; used by the installer and by the update.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\install-deps.ps1 [-Dir <install folder>] [-SkipPackages]
# Safe to run again: a package set is skipped when its lock file has not changed since the last successful run.
param(
  [string]$Dir = '',
  [switch]$SkipPackages
)
$ErrorActionPreference = 'Continue'
if (-not $Dir) { $Dir = Split-Path -Parent $PSScriptRoot }

function Say($m) { Write-Host "`n> $m" -ForegroundColor Cyan }
function Ok($m)  { Write-Host "[OK]   $m" -ForegroundColor Green }
function Fail($m) { Write-Host "[FAIL] $m" -ForegroundColor Red; exit 1 }
function Sha($file) { if (Test-Path -LiteralPath $file) { (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash } else { '' } }
function Python-Has-Packages {
  try { $o = & python -c 'import numpy, scipy, faster_whisper; print(1)' 2>$null | Out-String; return ($LASTEXITCODE -eq 0 -and $o.Trim() -eq '1') } catch { return $false }
}

if (-not (Test-Path -LiteralPath (Join-Path $Dir 'starter'))) { Fail "The folder $Dir does not hold the Motion Studio package (no starter folder)." }

if (-not $SkipPackages) {
  $stateFile = Join-Path $Dir '.install-state.json'
  $state = @{}
  if (Test-Path -LiteralPath $stateFile) {
    try { (Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $state[$_.Name] = [string]$_.Value } } catch { $state = @{} }
  }
  function Save-State { ($state | ConvertTo-Json) | Set-Content -LiteralPath $stateFile -Encoding utf8 }
  function Npm-Ci($key, $sub, $label, [string[]]$extra) {
    $folder = if ($sub) { Join-Path $Dir $sub } else { $Dir }
    $hash = Sha (Join-Path $folder 'package-lock.json')
    if ($state[$key] -eq $hash -and (Test-Path -LiteralPath (Join-Path $folder 'node_modules'))) { Ok "$label packages already installed"; return }
    Say "Installing $label packages (npm ci; this can take a few minutes)"
    Push-Location -LiteralPath $folder
    try { $a = @('ci', '--no-audit', '--no-fund') + $extra; & npm @a | Out-Host; $code = $LASTEXITCODE } finally { Pop-Location }
    if ($code -ne 0) { Fail "npm ci failed for the $label packages. Check your internet connection and run this again." }
    $state[$key] = $hash; Save-State
  }

  # --ignore-scripts: with a lock file npm tries to compile better-sqlite3 (node-gyp, needs Visual Studio) although the package brings its own ready binaries; no app package needs an install script.
  Npm-Ci 'app' '' 'app' @('--ignore-scripts')
  Push-Location -LiteralPath $Dir
  try { & node -e "const D = require('better-sqlite3'); new D(':memory:').close(); require('esbuild').transformSync('let a = 1')" 2>&1 | Out-Host; $code = $LASTEXITCODE } finally { Pop-Location }
  if ($code -ne 0) { Fail 'The app packages were installed but do not load (database or build tool). Delete the node_modules folder in the app folder and run this again.' }
  # The engine's install also downloads Chromium for the render (Playwright); the next step makes sure it is there.
  Npm-Ci 'engine' 'engine' 'render engine' @()
  Say 'Checking the render browser (Playwright Chromium)'
  Push-Location -LiteralPath (Join-Path $Dir 'engine')
  try { & node (Join-Path $Dir 'engine\node_modules\playwright\cli.js') install chromium | Out-Host; $code = $LASTEXITCODE } finally { Pop-Location }
  if ($code -ne 0) { Fail 'The render browser (Chromium) could not be downloaded. Check your internet connection and run this again.' }
  # ava-farsi pins esbuild ^0.25 while vite lists a newer esbuild as an optional peer; npm refuses that without --legacy-peer-deps.
  Npm-Ci 'ava' 'ava-farsi\avafarsi' 'voice app (ava-farsi)' @('--legacy-peer-deps')

  if (Python-Has-Packages) { Ok 'Python packages already installed' }
  else {
    Say 'Installing Python packages (numpy, scipy, faster-whisper)'
    & python -m pip install --upgrade --disable-pip-version-check numpy scipy faster-whisper | Out-Host
    if (-not (Python-Has-Packages)) { Fail 'The Python packages could not be installed (pip). Check your internet connection and run this again.' }
  }
}

# Your own files: config, word list, starter library. Existing files are kept.
Say 'Preparing your folders'
& node (Join-Path $Dir 'scripts\user-files.mjs') --root $Dir | Out-Host
if ($LASTEXITCODE -ne 0) { Fail 'Could not prepare the folders (scripts\user-files.mjs).' }
exit 0
