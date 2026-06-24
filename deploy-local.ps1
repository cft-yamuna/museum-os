# deploy-local.ps1
# Rebuild and restart the local museumos-app Docker container after a code change.
# 100% local — does NOT SSH into or touch any remote server.
#
# Run by double-clicking deploy-local.bat, or:
#   powershell -ExecutionPolicy Bypass -File deploy-local.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "==> Rebuilding museumos-app (local Docker)..." -ForegroundColor Cyan

# Rebuilds only the app image and recreates its container.
# Postgres (museumos-db) keeps running. --env-file loads .env.production.
docker compose --env-file .env.production up -d --build museumos-app

Write-Host ""
Write-Host "==> Done. App is at http://localhost:3401" -ForegroundColor Green
Write-Host "==> Tailing logs (close this window or press Ctrl+C to stop)..." -ForegroundColor Yellow
Write-Host ""

docker compose logs -f --tail=40 museumos-app
