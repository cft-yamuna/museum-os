# setup-all.ps1  (lives in scripts/, invoked by ..\setup-all.bat)
# One-shot first-run setup for a fresh clone of Museum OS (Windows, local-only).
# Does NOT touch any remote server.
#
#   Step 1  Check prerequisites (Docker, Node, npm, tar, curl, git)
#   Step 2  Verify the committed .env.production is present
#   ( + )   Build & start the Docker stack and wait until it's healthy
#           (required before the agent can be uploaded)
#   Step 5  Build & upload the agent package to the local server
#
# Run via the repo-root wrapper setup-all.bat, or directly:
#   powershell -ExecutionPolicy Bypass -File scripts\setup-all.ps1

$ErrorActionPreference = 'Stop'
# Repo root is the parent of this scripts/ folder; compose + .env live there.
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Section($t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Cyan }
function Ok($t)      { Write-Host "  [OK]  $t" -ForegroundColor Green }
function Warn($t)    { Write-Host "  [! ]  $t" -ForegroundColor Yellow }
function Fail($t)    { Write-Host "  [X ]  $t" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# Step 1 - Prerequisites
# ---------------------------------------------------------------------------
Section "Step 1: Checking prerequisites"

function Need($name, $hint) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { Ok "$name found"; return $true }
  Fail "$name NOT found. $hint"; return $false
}

$haveDocker = Need "docker" "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
$haveNode   = Need "node"   "Install Node.js 20+: https://nodejs.org/"
$haveNpm    = Need "npm"    "Ships with Node.js."
$haveTar    = Need "tar"    "Ships with Windows 10/11."
$haveCurl   = Need "curl"   "Ships with Windows 10/11."
Need "git" "Optional, only needed to pull updates." | Out-Null

if (-not $haveDocker) { Fail "Docker is required to run the stack. Aborting."; exit 1 }

# Is the Docker daemon actually running?
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Fail "Docker is installed but the daemon isn't running. Start Docker Desktop, then re-run."
  exit 1
}
Ok "Docker daemon is running"

# ---------------------------------------------------------------------------
# Step 2 - Environment (kept committed/ready in the repo)
# ---------------------------------------------------------------------------
Section "Step 2: Verifying environment (.env.production)"

if (-not (Test-Path ".env.production")) {
  Fail ".env.production is missing (it should be committed in the repo). Aborting."
  exit 1
}
Ok ".env.production present - ready to use, no edits needed for local"

# ---------------------------------------------------------------------------
# Build & start the stack (prerequisite for the agent upload below)
# ---------------------------------------------------------------------------
Section "Building and starting the Docker stack"

docker compose --env-file .env.production up -d --build
if ($LASTEXITCODE -ne 0) { Fail "docker compose failed. See output above."; exit 1 }

Write-Host "  Waiting for the server to become healthy (up to ~3 min on first build)" -NoNewline
$ready = $false
foreach ($i in 1..60) {
  try {
    $r = Invoke-WebRequest "http://localhost:3401/api/health" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -ge 200) { $ready = $true; break }
  } catch {
    # An HTTP error response still means the server is listening.
    if ($_.Exception.Response) { $ready = $true; break }
  }
  Start-Sleep -Seconds 3
  Write-Host "." -NoNewline
}
Write-Host ""

if (-not $ready) {
  Warn "Server didn't respond on http://localhost:3401 in time."
  Warn "Check logs:  docker compose logs -f museumos-app"
  Warn "Skipping the agent upload (it needs the server running)."
  exit 1
}
Ok "Server is up at http://localhost:3401  (login: admin@museumos.local / admin123)"

# ---------------------------------------------------------------------------
# Step 5 - Build & upload the agent package
# ---------------------------------------------------------------------------
Section "Step 5: Building and uploading the agent package"

if (-not ($haveNode -and $haveNpm -and $haveTar -and $haveCurl)) {
  Warn "Missing node/npm/tar/curl - skipping agent build."
  Warn "Install them, then run: scripts\auto-deploy-agent.ps1 -Force -Platforms windows -MuseumosUrl http://localhost:3401"
} else {
  try {
    # auto-deploy-agent.ps1 lives in this same scripts/ folder.
    & "$PSScriptRoot\auto-deploy-agent.ps1" -Force -Platforms windows -MuseumosUrl "http://localhost:3401"
    Ok "Agent package built and uploaded."
  } catch {
    Warn "Agent build/upload failed: $($_.Exception.Message)"
    Warn "You can retry later with: scripts\auto-deploy-agent.ps1 -Force -Platforms windows -MuseumosUrl http://localhost:3401"
  }
}

# ---------------------------------------------------------------------------
Section "Setup complete"
Write-Host "  Admin UI : http://localhost:3401" -ForegroundColor Green
Write-Host "  Login    : admin@museumos.local / admin123" -ForegroundColor Green
Write-Host "  Logs     : docker compose logs -f museumos-app"
Write-Host "  Rebuild after a code change: deploy-local.bat"
