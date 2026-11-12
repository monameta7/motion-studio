# Responsibility: start the Mahdiyar Motion Studio server for the autostart task; does nothing when it is already running, and writes its output to data\logs\app.log.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$port = 4600
try { $port = [int](Get-Content -LiteralPath (Join-Path $root 'config\app.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json).server.port } catch { }
# Already running (the owner started it, or the logon task did): nothing to do.
if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { exit 0 }
# Windows 11 opens console programs in Windows Terminal, where -WindowStyle Hidden does not hide them: the window stayed on screen and
# closing it closed the app (owner, 2026-11-07). Start again inside a headless console (no window at all) and leave.
if (-not $env:MMS_HEADLESS) {
  $env:MMS_HEADLESS = '1'
  Start-Process -FilePath 'conhost.exe' -ArgumentList @('--headless', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"')) -WindowStyle Hidden
  exit 0
}
Set-Location -LiteralPath $root
New-Item -ItemType Directory -Force -Path (Join-Path $root 'data\logs') | Out-Null
npm start *>> (Join-Path $root 'data\logs\app.log')
