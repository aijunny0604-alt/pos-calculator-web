@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-MOVIS.ps1" -AskAutoStart
pause
