# Responsibility: register the Windows Task Scheduler entry that starts the app at logon and, with -At, once a day at each given time (docs/08; one time per brand whose automation is on, Phase 8). Runs as the current user, needs no administrator. Remove it with uninstall-autostart.ps1.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1 [-At 15:15[,05:30,...]] [-WhatIf]
param(
  [string]$At = '',
  [string]$TaskName = 'MahdiyarMotionStudio',
  [switch]$WhatIf
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$start = Join-Path $PSScriptRoot 'start-app.ps1'
$user = "$env:USERDOMAIN\$env:USERNAME"

$argument = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $start + '"'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument -WorkingDirectory $root
$triggers = @(New-ScheduledTaskTrigger -AtLogOn -User $user)
foreach ($t in ($At -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })) {
  if ($t -notmatch '^([01]\d|2[0-3]):[0-5]\d$') { throw "Invalid time: $t (use HH:MM, like 15:15)" }
  $triggers += New-ScheduledTaskTrigger -Daily -At $t
}
# A second start while the app runs is ignored; a missed start (the PC was off) runs when it can; no time limit.
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

if ($WhatIf) {
  Write-Output "WhatIf: task '$TaskName' for $user"
  Write-Output "  action : powershell.exe $argument"
  Write-Output ("  triggers: at logon" + $(if ($At) { ", daily at $At" } else { '' }))
  exit 0
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Starts Mahdiyar Motion Studio (docs/08). Remove with scripts\uninstall-autostart.ps1.' -Force | Out-Null
Write-Output "installed: $TaskName"
