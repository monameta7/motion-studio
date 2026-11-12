@echo off
rem Responsibility: double-click to update Motion Studio (scripts\update.ps1); the window stays open so the result can be read.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"
echo.
pause
