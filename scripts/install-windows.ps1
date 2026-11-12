# Responsibility: install Motion Studio for a new Windows user in one run: the tools (winget), Claude Code, the app folder, its packages, the starter files, a Desktop shortcut, then open the app on its welcome screen.
#   irm https://raw.githubusercontent.com/monameta7/motion-studio/main/scripts/install-windows.ps1 | iex
# Safe to run again: whatever is already installed is skipped, and your own folders (brand, jobs, refs, data) are never touched.
# Optional environment variables: STUDIO_DIR (install folder), STUDIO_REPO (where the package comes from), STUDIO_NO_START=1 (do not open the app at the end), STUDIO_NO_SHORTCUT=1 (no Desktop shortcut).
$ErrorActionPreference = 'Continue'
$Repo = if ($env:STUDIO_REPO) { $env:STUDIO_REPO } else { 'https://github.com/monameta7/motion-studio.git' }
$Dir  = if ($env:STUDIO_DIR) { $env:STUDIO_DIR } else { Join-Path $HOME 'motion-studio' }
$LocalBin = Join-Path $HOME '.local\bin'

function Say($m)  { Write-Host "`n> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[OK]   $m" -ForegroundColor Green }
function Stop-Install($m) {
  Write-Host "`n[STOPPED] $m" -ForegroundColor Red
  Write-Host 'Nothing is broken. Fix the line above, then run the same install line again; finished steps are skipped.' -ForegroundColor Yellow
  throw 'Motion Studio install stopped.'
}
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ";$LocalBin"
}
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
# Runs a tool and returns its text, or $null when it is missing or fails (the Microsoft Store "python" stub fails here).
function Try-Run($cmd, [string[]]$a) {
  if (-not (Has $cmd)) { return $null }
  try { $o = & $cmd @a 2>$null | Out-String; if ($LASTEXITCODE -eq 0) { return $o.Trim() } } catch { }
  return $null
}
function Node-Ok {
  $v = Try-Run 'node' @('-v')
  if (-not $v -or $v -notmatch '^v(\d+)\.(\d+)') { return $false }
  return ([int]$Matches[1] -gt 22) -or ([int]$Matches[1] -eq 22 -and [int]$Matches[2] -ge 12)
}
function Python-Ok { (Try-Run 'python' @('-c', 'import sys; print(1 if sys.version_info >= (3, 10) else 0)')) -eq '1' }
function Winget-Install($id, $name) {
  Say "Installing $name (winget: $id)"
  winget install --id $id -e --source winget --silent --accept-package-agreements --accept-source-agreements | Out-Host
  Refresh-Path
}

Write-Host "`nMotion Studio installer" -ForegroundColor White
Write-Host "Folder: $Dir"

# 1. Tools
Refresh-Path
# The Microsoft Visual C++ runtime: the speech-alignment package (faster-whisper) cannot load without it, and a new Windows does not have it (found in the clean-machine test).
function VcRuntime-Ok { (Test-Path -LiteralPath (Join-Path $env:SystemRoot 'System32\msvcp140.dll')) -and (Test-Path -LiteralPath (Join-Path $env:SystemRoot 'System32\vcruntime140_1.dll')) }
$needWinget = (-not (Has 'git')) -or (-not (Node-Ok)) -or (-not (Python-Ok)) -or (-not (Has 'ffmpeg')) -or (-not (Has 'ffprobe')) -or (-not (VcRuntime-Ok))
if ($needWinget -and -not (Has 'winget')) {
  Stop-Install 'winget was not found. Open the Microsoft Store, install "App Installer", then run the install line again.'
}
if (Has 'git') { Ok 'Git found' } else { Winget-Install 'Git.Git' 'Git' }
if (Node-Ok) { Ok "Node.js found ($(Try-Run 'node' @('-v')))" } else { Winget-Install 'OpenJS.NodeJS.22' 'Node.js 22' }
if (Python-Ok) { Ok "Python found ($(Try-Run 'python' @('--version')))" } else { Winget-Install 'Python.Python.3.12' 'Python 3.12' }
if ((Has 'ffmpeg') -and (Has 'ffprobe')) { Ok 'ffmpeg found' } else { Winget-Install 'Gyan.FFmpeg' 'ffmpeg' }
if (VcRuntime-Ok) { Ok 'Visual C++ runtime found' } else { Winget-Install 'Microsoft.VCRedist.2015+.x64' 'Microsoft Visual C++ runtime' }

$missing = @()
if (-not (VcRuntime-Ok)) { $missing += 'Microsoft Visual C++ runtime' }
if (-not (Has 'git')) { $missing += 'Git' }
if (-not (Node-Ok)) { $missing += 'Node.js 22.12 or newer' }
if (-not (Has 'npm')) { $missing += 'npm' }
if (-not (Python-Ok)) { $missing += 'Python 3.10 or newer' }
if (-not ((Has 'ffmpeg') -and (Has 'ffprobe'))) { $missing += 'ffmpeg' }
if ($missing.Count -gt 0) {
  Stop-Install ("Not ready yet: " + ($missing -join ', ') + '. Close this window, open a NEW PowerShell window and run the install line again (Windows shows a newly installed tool only to new windows).')
}

# 2. Claude Code (official installer)
if (Has 'claude') { Ok 'Claude Code found' }
else {
  Say 'Installing Claude Code (official installer)'
  try { Invoke-RestMethod https://claude.ai/install.ps1 | Invoke-Expression } catch { Stop-Install "The Claude Code installer failed: $($_.Exception.Message)" }
  Refresh-Path
  if (-not (Has 'claude')) { Stop-Install 'Claude Code was installed but is not found. Open a NEW PowerShell window and run the install line again.' }
}
# The app looks for claude.exe on PATH; the official installer puts it in %USERPROFILE%\.local\bin, which Windows does not always add.
if (Test-Path -LiteralPath (Join-Path $LocalBin 'claude.exe')) {
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (($userPath -split ';') -contains $LocalBin)) {
    [Environment]::SetEnvironmentVariable('Path', (($userPath.TrimEnd(';') + ';' + $LocalBin).TrimStart(';')), 'User')
    Ok "added $LocalBin to your PATH"
  }
}

# 3. The app folder
if (Test-Path -LiteralPath (Join-Path $Dir '.git')) {
  Say "Motion Studio is already in $Dir; getting the newest version"
  git -C $Dir pull --ff-only | Out-Host
  if ($LASTEXITCODE -ne 0) { Stop-Install 'Could not get the newest version (git pull failed). Check your internet connection and run the install line again.' }
} elseif ((Test-Path -LiteralPath $Dir) -and @(Get-ChildItem -LiteralPath $Dir -Force).Count -gt 0) {
  Stop-Install "The folder $Dir already exists and is not a Motion Studio install. Move it away, or set another folder first:  `$env:STUDIO_DIR = 'C:\some\folder'"
} else {
  Say "Downloading Motion Studio to $Dir"
  git -c core.autocrlf=false clone --depth 1 $Repo $Dir | Out-Host
  if ($LASTEXITCODE -ne 0) { Stop-Install 'The download failed (git clone). Check your internet connection and run the install line again.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $Dir 'starter'))) { Stop-Install "The folder $Dir does not hold the Motion Studio package (no starter folder)." }

# 4. Packages (npm, Chromium, Python) and your own files (config, word list, starter library). Existing files are kept.
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Dir 'scripts\install-deps.ps1') -Dir $Dir
if ($LASTEXITCODE -ne 0) { Stop-Install 'A package step failed (see the [FAIL] line above).' }

# 5. Desktop shortcut
if ($env:STUDIO_NO_SHORTCUT -ne '1') {
  $desk = [Environment]::GetFolderPath('Desktop')
  $ws = New-Object -ComObject WScript.Shell
  $s = $ws.CreateShortcut((Join-Path $desk 'Motion Studio.lnk'))
  $s.TargetPath = Join-Path $Dir 'scripts\start-windows.cmd'
  $s.WorkingDirectory = $Dir
  $s.WindowStyle = 7
  $s.Description = 'Open Motion Studio'
  $s.Save()
  Ok 'shortcut "Motion Studio" is on your Desktop'
}

Write-Host @"

Done. Motion Studio is installed in $Dir

  - Open it:   double-click "Motion Studio" on your Desktop.
  - Update it: double-click scripts\update-windows.cmd in that folder.
  - The first screen asks you to sign in to Claude (your own Pro or Max subscription) and to enter your Gemini key.

"@ -ForegroundColor Green

# 6. Open the app; a new install lands on the welcome screen.
if ($env:STUDIO_NO_START -ne '1') {
  Say 'Opening Motion Studio in your browser'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Dir 'scripts\open-app.ps1')
}
