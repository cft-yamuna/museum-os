@echo off
REM Double-click this to rebuild + restart the local curato-app container.
REM Purely local — never touches any remote server.
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-local.ps1"
pause
