# Responsibility: update an installed Motion Studio to the newest package (git pull, changed packages, new config keys) without touching the user's brand/, jobs/, refs/ or data/.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\update.ps1 [-Dir <install folder>] [-SkipPackages] [-NoStart]
# It refuses while a film is being made. Only files the package itself tracks change; the user's folders are outside git (.gitignore).
param(
  [string]$Dir = '',
  [switch]$SkipPackages,
  [switch]$NoStart
)
$ErrorActionPreference = 'Continue'
if (-not $Dir) { $Dir = Split-Path -Parent $PSScriptRoot }

function Say($m) { Write-Host "`n> $m" -ForegroundColor Cyan }
function Ok($m)  { Write-Host "[OK]   $m" -ForegroundColor Green }
function Fail($m) { Write-Host "[FAIL] $m" -ForegroundColor Red; exit 1 }

if (-not (Test-Path -LiteralPath (Join-Path $Dir '.git'))) { Fail "The folder $Dir was not installed with the installer (no .git folder); it cannot be updated this way." }
if (-not (Test-Path -LiteralPath (Join-Path $Dir 'starter'))) { Fail "The folder $Dir does not hold the Motion Studio package (no starter folder)." }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail 'Git was not found. Run the install line again, then update.' }

$port = 4600
try { $port = [int](Get-Content -LiteralPath (Join-Path $Dir 'config\app.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json).server.port } catch { }

# 1. A running app: never interrupt a film; an idle app is closed and opened again afterwards.
$wasRunning = $false
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $busy = $null
  try { $busy = @((Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/jobs" -TimeoutSec 10).jobs | Where-Object { $_.active }).Count } catch { }
  if ($null -eq $busy) { Fail "Something is using port $port but it did not answer as Motion Studio. Close it, then update again." }
  if ($busy -gt 0) { Fail 'A film is being made right now. Wait until it is finished, then update again. Nothing was changed.' }
  Say 'Closing Motion Studio for the update'
  & taskkill.exe /PID $listener.OwningProcess /T /F | Out-Null
  for ($i = 0; $i -lt 20 -and (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Seconds 1 }
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { Fail 'Motion Studio could not be closed. Close it yourself, then update again. Nothing was changed.' }
  $wasRunning = $true
}

# 2. The newest package. --ff-only: if a packaged file was changed by hand, git stops here and changes nothing.
$before = (& git -C $Dir rev-parse HEAD | Out-String).Trim()
Say 'Getting the newest version'
& git -C $Dir -c core.autocrlf=false pull --ff-only | Out-Host
$pullCode = $LASTEXITCODE
$after = (& git -C $Dir rev-parse HEAD | Out-String).Trim()
if ($pullCode -ne 0) {
  Write-Host '[FAIL] The update could not be downloaded (git pull). Check your internet connection. If a file of the app was changed by hand, that also stops it. Nothing was changed.' -ForegroundColor Red
  if ($wasRunning -and -not $NoStart) { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Dir 'scripts\open-app.ps1') -NoBrowser | Out-Null }
  exit 1
}
if ($before -eq $after) { Ok 'You already have the newest version' } else { Ok "updated ($($before.Substring(0, 7)) -> $($after.Substring(0, 7)))" }

# 3. Packages whose lock file changed, and new config keys (your own settings stay).
$depArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $Dir 'scripts\install-deps.ps1'), '-Dir', $Dir)
if ($SkipPackages) { $depArgs += '-SkipPackages' }
& powershell.exe @depArgs
if ($LASTEXITCODE -ne 0) { Fail 'A package step failed (see the [FAIL] line above). Run the update again.' }

Write-Host "`nUpdate finished. Your brands, films, library and settings were not touched." -ForegroundColor Green
if (-not $NoStart) { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Dir 'scripts\open-app.ps1') }
exit 0
