# Responsibility: open Motion Studio for the user: start the server if it is not running (start-app.ps1), wait until it answers, then open it in the browser.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\open-app.ps1 [-NoBrowser]
param([switch]$NoBrowser)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$port = 4600
try { $port = [int](Get-Content -LiteralPath (Join-Path $root 'config\app.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json).server.port } catch { }
# The official Claude Code installer puts claude.exe here; the app looks for it on PATH.
$localBin = Join-Path $HOME '.local\bin'
if ((Test-Path -LiteralPath $localBin) -and -not (($env:Path -split ';') -contains $localBin)) { $env:Path = $env:Path + ';' + $localBin }

function Listening { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }

if (-not (Listening)) {
  Write-Host 'Starting Motion Studio (the first start can take a minute)...'
  & (Join-Path $PSScriptRoot 'start-app.ps1')
  for ($i = 0; $i -lt 120 -and -not (Listening); $i++) { Start-Sleep -Seconds 1 }
}
if (-not (Listening)) {
  Write-Host "Motion Studio did not start. The reason is at the end of this file: $(Join-Path $root 'data\logs\app.log')" -ForegroundColor Red
  Start-Sleep -Seconds 15
  exit 1
}
if (-not $NoBrowser) { Start-Process "http://localhost:$port/" }
exit 0
