@echo off
REM First-run setup for a fresh clone of Museum OS (Windows, local-only).
REM Double-click this once after cloning. It will:
REM   1. check prerequisites (Docker, Node, etc.)
REM   2. verify the committed .env.production
REM   - build + start the Docker stack (app + Postgres) and wait until healthy
REM   5. build + upload the agent package to the local server
REM Never touches any remote server.
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\setup-all.ps1"
pause
