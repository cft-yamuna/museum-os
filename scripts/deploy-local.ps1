# deploy-local.ps1  (lives in scripts/, invoked by ..\deploy-local.bat)
# Rebuild and restart the local museumos-app Docker container after a code change.
# 100% local - does NOT SSH into or touch any remote server.
#
# Run via the repo-root wrapper deploy-local.bat, or directly:
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-local.ps1

$ErrorActionPreference = 'Stop'
# Repo root is the parent of this scripts/ folder; docker compose must run there.
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "==> Rebuilding museumos-app (local Docker)..." -ForegroundColor Cyan

# Rebuilds only the app image and recreates its container.
# Postgres (museumos-db) keeps running. --env-file loads .env.production.
docker compose --env-file .env.production up -d --build museumos-app

Write-Host ""
Write-Host "==> Done. App is at http://localhost:3401" -ForegroundColor Green
Write-Host "==> Tailing logs (close this window or press Ctrl+C to stop)..." -ForegroundColor Yellow
Write-Host ""

docker compose logs -f --tail=40 museumos-app
