#!/usr/bin/env bash
#
# auto-deploy-all.sh
#
# Run on the SERVER machine via cron. Pulls latest code from GitHub,
# rebuilds any component that changed (server, admin, display, agent),
# and restarts/registers as needed.
#
# Usage:
#   ./scripts/auto-deploy-all.sh
#
# Cron example (every 5 minutes):
#   */5 * * * * /opt/curato/App01/scripts/auto-deploy-all.sh >> /var/log/curato-deploy.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CURATO_DIR="${CURATO_DIR:-$(dirname "$SCRIPT_DIR")}"
CURATO_URL="${CURATO_URL:-http://localhost:3401}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@curato.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
PLATFORM="${PLATFORM:-linux}"

STATE_DIR="$CURATO_DIR/.deploy-state"
mkdir -p "$STATE_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

get_hash() { git log -1 --format=%H -- "$1" 2>/dev/null || echo ""; }
get_last() { cat "$STATE_DIR/$1" 2>/dev/null || echo ""; }
save_hash() { echo "$2" > "$STATE_DIR/$1"; }

cd "$CURATO_DIR"

# ── Pull latest ──
log "Pulling latest..."
git pull --ff-only origin main 2>/dev/null || {
  log "WARNING: git pull failed. Skipping."
  exit 0
}

CHANGES=0

# ── Server / Admin / Display (all baked into Docker image) ──
SERVER_HASH=$(get_hash "server/")
ADMIN_HASH=$(get_hash "admin/")
DISPLAY_HASH=$(get_hash "display/")
DOCKER_HASH=$(get_hash "Dockerfile")

NEED_DOCKER_REBUILD=0
if [ -n "$SERVER_HASH" ] && [ "$SERVER_HASH" != "$(get_last server)" ]; then
  log "Server changed"; NEED_DOCKER_REBUILD=1
fi
if [ -n "$ADMIN_HASH" ] && [ "$ADMIN_HASH" != "$(get_last admin)" ]; then
  log "Admin UI changed"; NEED_DOCKER_REBUILD=1
fi
if [ -n "$DISPLAY_HASH" ] && [ "$DISPLAY_HASH" != "$(get_last display)" ]; then
  log "Display app changed"; NEED_DOCKER_REBUILD=1
fi
if [ -n "$DOCKER_HASH" ] && [ "$DOCKER_HASH" != "$(get_last dockerfile)" ]; then
  log "Dockerfile changed"; NEED_DOCKER_REBUILD=1
fi

if [ "$NEED_DOCKER_REBUILD" -eq 1 ]; then
  log "Rebuilding Docker image and restarting..."
  cd "$CURATO_DIR"

  # Use docker compose if docker-compose.yml exists, else fall back to manual docker commands
  if [ -f docker-compose.yml ]; then
    docker compose --env-file .env.production up -d --build curato-app 2>&1 | tail -5
    log "Docker container rebuilt and restarted via docker compose"
  else
    docker build -t curato-app . 2>&1 | tail -3
    docker stop curato-app 2>/dev/null || true
    docker rm curato-app 2>/dev/null || true
    log "WARNING: No docker-compose.yml — image rebuilt but container must be started manually"
  fi

  [ -n "$SERVER_HASH" ] && save_hash server "$SERVER_HASH"
  [ -n "$ADMIN_HASH" ] && save_hash admin "$ADMIN_HASH"
  [ -n "$DISPLAY_HASH" ] && save_hash display "$DISPLAY_HASH"
  [ -n "$DOCKER_HASH" ] && save_hash dockerfile "$DOCKER_HASH"
  CHANGES=$((CHANGES + 1))
fi

# ── Agent (OTA) ──
AGENT_HASH=$(get_hash "agent/")
if [ -n "$AGENT_HASH" ] && [ "$AGENT_HASH" != "$(get_last agent)" ]; then
  log "Agent changed - building tarball for OTA..."
  log "Building display bundle for agent package..."
  cd "$CURATO_DIR/display"
  npm install --silent 2>/dev/null || npm install 2>/dev/null
  npm run build

  cd "$CURATO_DIR/agent"
  npm install --silent 2>/dev/null || npm install 2>/dev/null
  npm run build:package
  npm prune --omit=dev --silent 2>/dev/null || npm prune --production --silent 2>/dev/null

  AGENT_VERSION=$(node -e "console.log(require('./package.json').version)")
  GIT_SHORT=$(cd "$CURATO_DIR" && git rev-parse --short HEAD)
  DEPLOY_VERSION="${AGENT_VERSION}+${GIT_SHORT}"

  TARBALL="/tmp/curato-agent-${DEPLOY_VERSION}.tar.gz"
  tar -czf "$TARBALL" dist/ node_modules/ package.json agent.config.template.json scripts/ bin/ nssm/ public/

  # Get admin token
  TOKEN=$(curl -sf "$CURATO_URL/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
    | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.data.token)})" 2>/dev/null || echo "")

  if [ -n "$TOKEN" ]; then
    RESULT=$(curl -sf "$CURATO_URL/api/agent/upload" \
      -H "Authorization: Bearer $TOKEN" \
      -F "file=@${TARBALL}" \
      -F "version=${DEPLOY_VERSION}" \
      -F "platform=${PLATFORM}" 2>/dev/null || echo '{"success":false}')

    if echo "$RESULT" | node -e "process.stdin.on('data',d=>{process.exit(JSON.parse(d).success?0:1)})" 2>/dev/null; then
      log "Agent v${DEPLOY_VERSION} uploaded — agents will auto-update"
      save_hash agent "$AGENT_HASH"
    else
      log "ERROR: Agent upload failed"
    fi
  else
    log "ERROR: Could not get admin token for agent upload"
  fi

  rm -f "$TARBALL"
  CHANGES=$((CHANGES + 1))
fi

if [ "$CHANGES" -eq 0 ]; then
  log "No changes detected."
else
  log "Deployed $CHANGES component(s)."
fi
