# Curato - self-update host relay (Windows)
# ============================================================================
# WHY: The server runs inside the curato-app Docker container, which has no
# access to the host git repo or to Docker, so it can't update or rebuild
# itself. When an admin clicks "Update" in Settings, the server logs the marker
#   [SELFUPDATE] requested id=<uuid>
# This relay runs ON the host (where the repo and Docker live), tails the
# container logs, and on that marker runs:
#   git fetch  ->  git pull --ff-only  ->  docker compose up -d --build curato-app
# i.e. exactly what scripts/deploy-local.ps1 does, plus a git pull first.
#
# It figures out the repo location from its OWN path (this file lives in the
# repo's scripts/ folder), so there is nothing to configure.
#
# Progress is written to server/storage/update-status.json, which is bind-mounted
# into the container, so the admin UI can read it back through the restart.
#
# Auto-started by setup-all.ps1. Run directly:
#   powershell -ExecutionPolicy Bypass -File scripts\update-relay.ps1
# ============================================================================

param(
    [string]$Container = 'curato-app',
    [string]$LogFile   = 'C:\ProgramData\Curato-UpdateRelay\relay.log'
)

$ErrorActionPreference = 'Continue'

# Repo root is the parent of this scripts/ folder (self-locating, like the other scripts).
$RepoRoot   = Split-Path -Parent $PSScriptRoot
$StatusFile = Join-Path $RepoRoot 'server\storage\update-status.json'

$logDir = Split-Path -Parent $LogFile
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

function Write-Log([string]$msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $LogFile -Value $line
}

function Set-Status([hashtable]$fields) {
    $obj = @{} + $fields
    $obj['updatedAt'] = (Get-Date).ToString('o')
    try {
        $dir = Split-Path -Parent $StatusFile
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        ($obj | ConvertTo-Json -Depth 5) | Set-Content -Path $StatusFile -Encoding UTF8
    } catch {
        Write-Log ("Failed to write status file: {0}" -f $_.Exception.Message)
    }
}

function Get-GitHash {
    try {
        $h = (git -C $RepoRoot rev-parse --short HEAD 2>$null)
        if ($LASTEXITCODE -eq 0 -and $h) { return $h.Trim() }
    } catch {}
    return 'unknown'
}

function Invoke-Update([string]$requestId) {
    Write-Log "Update requested (id=$requestId) - starting"
    $before    = Get-GitHash
    $startedAt = (Get-Date).ToString('o')

    Set-Status @{ stage = 'fetching'; requestId = $requestId; message = 'Fetching latest code...'; startedAt = $startedAt; gitBefore = $before }
    git -C $RepoRoot fetch --all --prune 2>&1 | ForEach-Object { Write-Log "  git: $_" }

    Set-Status @{ stage = 'pulling'; requestId = $requestId; message = 'Pulling changes...'; startedAt = $startedAt; gitBefore = $before }
    $pull = git -C $RepoRoot pull --ff-only 2>&1
    $pull | ForEach-Object { Write-Log "  git: $_" }
    if ($LASTEXITCODE -ne 0) {
        Set-Status @{ stage = 'error'; requestId = $requestId; message = 'git pull failed - resolve manually on the host.'; startedAt = $startedAt; gitBefore = $before; error = ($pull -join "`n") }
        Write-Log 'git pull failed; aborting update'
        return
    }

    Set-Status @{ stage = 'building'; requestId = $requestId; message = 'Rebuilding and restarting the server (this takes a few minutes)...'; startedAt = $startedAt; gitBefore = $before }
    Push-Location $RepoRoot
    try {
        docker compose --env-file .env.production up -d --build curato-app 2>&1 | ForEach-Object { Write-Log "  docker: $_" }
        $buildExit = $LASTEXITCODE
    } finally {
        Pop-Location
    }

    if ($buildExit -ne 0) {
        Set-Status @{ stage = 'error'; requestId = $requestId; message = 'docker rebuild failed - check the relay log.'; startedAt = $startedAt; gitBefore = $before; error = "docker compose exited with code $buildExit" }
        Write-Log "docker rebuild failed (exit $buildExit)"
        return
    }

    $after = Get-GitHash
    Set-Status @{ stage = 'done'; requestId = $requestId; message = "Update complete ($before -> $after)."; startedAt = $startedAt; gitBefore = $before; gitAfter = $after }
    Write-Log "Update complete ($before -> $after)"
}

Write-Log "===== Update relay starting (container=$Container, repo=$RepoRoot) ====="

# Catch up on a job that was queued before the relay started. The live log tail
# below uses --tail 0 and won't replay an older marker, so without this a job
# requested while the relay was down would sit at 'requested' forever.
try {
    if (Test-Path $StatusFile) {
        $pending = Get-Content $StatusFile -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
        if ($pending -and $pending.stage -eq 'requested' -and $pending.requestId) {
            Write-Log "Found a pending update job at startup (id=$($pending.requestId)) - processing now"
            Invoke-Update $pending.requestId
        }
    }
} catch {
    Write-Log ("Startup catch-up check failed: {0}" -f $_.Exception.Message)
}

while ($true) {
    try {
        # --tail 0 = only NEW lines, so a marker is never replayed after a reconnect.
        docker logs -f --tail 0 $Container 2>&1 | ForEach-Object {
            $line = [string]$_
            $m = [regex]::Match($line, '\[SELFUPDATE\]\s+requested\s+id=([0-9a-fA-F-]{8,})')
            if ($m.Success) {
                Invoke-Update $m.Groups[1].Value
            }
        }
        Write-Log 'docker logs stream ended; reconnecting in 3s...'
    } catch {
        Write-Log ("docker logs error: {0}; retry in 3s" -f $_.Exception.Message)
    }
    Start-Sleep -Seconds 3
}
