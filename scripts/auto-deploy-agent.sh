#!/usr/bin/env bash
#
# auto-deploy-agent.sh
#
# Run this on the SERVER machine via cron (e.g. every 5 minutes).
# It pulls the latest code from GitHub, checks if agent/ changed,
# builds a tarball, and registers it with the server API.
# Connected agents will auto-update within 5 minutes.
#
# Usage:
#   ./scripts/auto-deploy-agent.sh
#
# Cron example (every 5 minutes):
#   */5 * * * * /opt/museumos/App01/scripts/auto-deploy-agent.sh >> /var/log/museumos-deploy.log 2>&1
#
# Required env vars (or set defaults below):
#   MUSEUMOS_DIR    — path to the App01 repo (default: script's parent dir)
#   MUSEUMOS_URL    — server base URL (default: http://localhost:3401)
#   ADMIN_EMAIL     - admin login email (default: admin@museumos.local)
#   ADMIN_PASSWORD  — admin login password (default: admin123)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MUSEUMOS_DIR="${MUSEUMOS_DIR:-$(dirname "$SCRIPT_DIR")}"
MUSEUMOS_URL="${MUSEUMOS_URL:-http://localhost:3401}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@museumos.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

AGENT_DIR="$MUSEUMOS_DIR/agent"
DISPLAY_DIR="$MUSEUMOS_DIR/display"
DEPLOY_STATE_FILE="$MUSEUMOS_DIR/.agent-deploy-hash"
PLATFORMS="${PLATFORMS:-linux,windows}"
FORCE_DEPLOY="${FORCE_DEPLOY:-0}"
PULL_BRANCH="${PULL_BRANCH:-}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

cd "$MUSEUMOS_DIR"
if [ -z "$PULL_BRANCH" ]; then
  PULL_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
fi

# 1. Pull latest from GitHub
log "Pulling latest from GitHub..."
git pull --ff-only origin "$PULL_BRANCH" 2>/dev/null || {
  log "WARNING: git pull failed (maybe no internet or merge conflict). Skipping."
  exit 0
}

# 2. Get current agent hash (based on agent/ directory content)
CURRENT_HASH=$(git log -1 --format=%H -- agent/)
if [ -z "$CURRENT_HASH" ]; then
  log "No commits found for agent/. Skipping."
  exit 0
fi

# 3. Compare with last deployed hash
LAST_HASH=""
if [ -f "$DEPLOY_STATE_FILE" ]; then
  LAST_HASH=$(cat "$DEPLOY_STATE_FILE")
fi

if [ "$FORCE_DEPLOY" != "1" ] && [ "$CURRENT_HASH" = "$LAST_HASH" ]; then
  log "Agent unchanged (hash: ${CURRENT_HASH:0:8}). Nothing to do."
  exit 0
fi

log "Agent changed! Last: ${LAST_HASH:0:8}, Current: ${CURRENT_HASH:0:8}"

# 4. Get version from agent/package.json
AGENT_VERSION=$(node -e "console.log(require('./agent/package.json').version)")
GIT_SHORT=$(git rev-parse --short HEAD)
DEPLOY_VERSION="${AGENT_VERSION}+${GIT_SHORT}"
log "Building agent v${DEPLOY_VERSION}..."

log "Building display bundle for agent package..."
cd "$DISPLAY_DIR"
npm install --silent 2>/dev/null || npm install 2>/dev/null
npm run build

# 5. Install ALL dependencies (dev needed for tsc), clean build, then prune to production
cd "$AGENT_DIR"
npm install --silent 2>/dev/null || npm install 2>/dev/null
rm -rf dist
npm run build:package
npm prune --omit=dev --silent 2>/dev/null || npm prune --production --silent 2>/dev/null

# 6. Create tarball (dist/, node_modules/, package.json — NO agent.config.json,
#    that's device-specific and must not be overwritten by OTA updates)
TARBALL="/tmp/museumos-agent-${DEPLOY_VERSION}.tar.gz"
tar -czf "$TARBALL" \
  -C "$AGENT_DIR" \
  dist/ \
  node_modules/ \
  package.json \
  agent.config.template.json \
  scripts/ \
  bin/ \
  nssm/ \
  public/

TARBALL_SIZE=$(stat -f%z "$TARBALL" 2>/dev/null || stat -c%s "$TARBALL" 2>/dev/null)
log "Tarball created: ${TARBALL} ($(( TARBALL_SIZE / 1024 ))KB)"

# 7. Get admin JWT token
TOKEN=$(curl -sf "$MUSEUMOS_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
  | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.data.token)})" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  log "ERROR: Failed to get admin token. Is the server running?"
  rm -f "$TARBALL"
  exit 1
fi

# 8. Upload tarball to server for each platform
UPLOAD_OK=true
IFS=',' read -ra PLATFORM_LIST <<< "$PLATFORMS"
for PLAT in "${PLATFORM_LIST[@]}"; do
  log "Uploading for platform: ${PLAT}..."
  UPLOAD_RESULT=$(curl -sf "$MUSEUMOS_URL/api/agent/upload" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@${TARBALL}" \
    -F "version=${DEPLOY_VERSION}" \
    -F "platform=${PLAT}")

  if echo "$UPLOAD_RESULT" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);process.exit(j.success?0:1)})" 2>/dev/null; then
    log "Upload successful for ${PLAT}!"
  else
    log "ERROR: Upload failed for ${PLAT}: $UPLOAD_RESULT"
    UPLOAD_OK=false
  fi
done

if [ "$UPLOAD_OK" = true ]; then
  log "All platforms uploaded. Agents will auto-update to v${DEPLOY_VERSION}"
  echo "$CURRENT_HASH" > "$DEPLOY_STATE_FILE"
else
  log "WARNING: Some platform uploads failed"
  rm -f "$TARBALL"
  exit 1
fi

# 9. Cleanup
rm -f "$TARBALL"
log "Done."
