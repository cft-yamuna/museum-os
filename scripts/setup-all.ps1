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
Section "Step 1: Checking prerequisites (already-installed tools are skipped)"

function Have($name) { return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $user    = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

# Already installed -> skip and move on. Missing -> try winget, else point at a link.
function Ensure-Tool($name, $wingetId, $hint) {
  if (Have $name) { Ok "$name already installed - skipping"; return $true }
  Warn "$name not found - attempting install via winget..."
  if (Have "winget") {
    winget install --id $wingetId -e --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
    if (Have $name) { Ok "$name installed"; return $true }
    Warn "$name was installed but isn't on PATH yet - open a new terminal and re-run."
    return $false
  }
  Fail "$name missing and winget is unavailable. $hint"
  return $false
}

$haveDocker = Ensure-Tool "docker" "Docker.DockerDesktop" "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
$haveNode   = Ensure-Tool "node"   "OpenJS.NodeJS.LTS"    "Install Node.js 20+: https://nodejs.org/"
$haveGit    = Ensure-Tool "git"    "Git.Git"              "Install Git: https://git-scm.com/"
# npm ships with Node; tar/curl ship with Windows 10/11 - just check, no install.
$haveNpm  = Have "npm";  if ($haveNpm)  { Ok "npm already installed - skipping" }  else { Warn "npm not found (comes with Node.js)." }
$haveTar  = Have "tar";  if ($haveTar)  { Ok "tar already installed - skipping" }  else { Warn "tar not found (ships with Windows 10/11)." }
$haveCurl = Have "curl"; if ($haveCurl) { Ok "curl already installed - skipping" } else { Warn "curl not found (ships with Windows 10/11)." }

if (-not $haveDocker) { Fail "Docker is required to run the stack. Install it, then re-run."; exit 1 }

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
# Open the Windows firewall so kiosks on the LAN can reach the server.
# Docker publishes 3401 on all interfaces, but Windows blocks inbound LAN
# connections without an allow rule. Adding the rule needs Administrator.
# ---------------------------------------------------------------------------
Section "Opening firewall for kiosks (inbound TCP 3401)"

$fwRuleName = "Museum OS Server (3401)"
try {
  if (Get-NetFirewallRule -DisplayName $fwRuleName -ErrorAction SilentlyContinue) {
    Ok "Firewall rule already exists - skipping"
  } else {
    New-NetFirewallRule -DisplayName $fwRuleName -Direction Inbound -Action Allow `
      -Protocol TCP -LocalPort 3401 -Profile Any -ErrorAction Stop | Out-Null
    Ok "Created inbound allow rule for TCP 3401 - kiosks can now reach this server"
  }
} catch {
  Warn "Couldn't add the firewall rule (needs Administrator)."
  Warn "Right-click setup-all.bat -> 'Run as administrator', OR run this in an elevated PowerShell:"
  Warn '  New-NetFirewallRule -DisplayName "Museum OS Server (3401)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3401 -Profile Any'
}

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
# Self-update relay - lets the admin "Update" button (Settings) git-pull + rebuild.
# The server is containerised and can't update itself, so this host watcher does
# it. We auto-start it now and add a hidden launcher to the Startup folder so it
# comes back on logon.
# ---------------------------------------------------------------------------
Section "Enabling the self-update relay"

$relayScript = Join-Path $ScriptsDir 'update-relay.ps1'
if (-not (Test-Path $relayScript)) {
  Warn "update-relay.ps1 not found - skipping (the admin Update button won't work until it's present)."
} else {
  try {
    # Startup launcher with the absolute path baked in (a copied self-locating
    # .vbs would resolve to the Startup folder, so we generate it here instead).
    $startupDir = [Environment]::GetFolderPath('Startup')
    $startupVbs = Join-Path $startupDir 'museumos-update-relay.vbs'
    $vbs = @"
' Museum OS - update relay launcher (auto-generated by setup-all)
' Starts the self-update host relay hidden at logon.
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$relayScript""", 0, False
"@
    Set-Content -Path $startupVbs -Value $vbs -Encoding ASCII
    Ok "Relay will auto-start at logon ($startupVbs)"

    # Start it now if it isn't already running, so updates work without a logout.
    $running = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -and $_.CommandLine -match 'update-relay\.ps1' }
    if ($running) {
      Ok "Update relay already running"
    } else {
      Start-Process powershell.exe `
        -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File', $relayScript) `
        -WindowStyle Hidden
      Ok "Update relay started"
    }
  } catch {
    Warn "Could not enable the update relay: $($_.Exception.Message)"
    Warn "Start it manually with: powershell -ExecutionPolicy Bypass -File scripts\update-relay.ps1"
  }
}

# ---------------------------------------------------------------------------
Section "Setup complete"
Write-Host "  Admin UI : http://localhost:3401" -ForegroundColor Green
Write-Host "  Login    : admin@museumos.local / admin123" -ForegroundColor Green
Write-Host "  Logs     : docker compose logs -f museumos-app"
Write-Host "  Rebuild after a code change: deploy-local.bat"
