# Responsibility: remove the Task Scheduler entry that install-autostart.ps1 made; does nothing when there is none.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\uninstall-autostart.ps1
param([string]$TaskName = 'MahdiyarMotionStudio')
$ErrorActionPreference = 'Stop'
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "removed: $TaskName"
} else {
  Write-Output "not installed: $TaskName"
}
