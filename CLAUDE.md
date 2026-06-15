# Museum OS - Museum Display Management System

## Project Overview
Museum OS is a museum display management platform consisting of a server, admin UI, display frontend, and device agents. It manages kiosk displays across museum sites, handling content delivery, device monitoring, remote control, and automated updates.

## Architecture

### Components
- **Server** (`server/`) — Express.js + TypeScript API, runs in Docker at port 3401
- **Admin UI** (`admin/`) — React 19 + TypeScript + Tailwind CSS + Vite, served from Docker
- **Display** (`display/`) — Vite SPA served at `/display/:slug`, shown on kiosk devices. Dev server at port 3403
- **Agent** (`agent/`) — Node.js daemon installed on Windows/Linux museum display machines

### Infrastructure
- **Server**: Docker container `lightman-app` on `wipro-poweredge-r360` (Tailscale: `100.124.40.69`, LAN: `192.168.10.100`)
- **Database**: PostgreSQL 16 in Docker container `lightman-db`
- **Devices**: Windows 11 Pro kiosk machines on `192.168.10.10x` range
- **Site ID**: `e74b5c5f-dd1c-4d0a-9520-9f4cac3881b2` (needed for API calls)

### Ports
| Service | Port |
|---------|------|
| Server API / Admin UI | 3401 |
| Display dev server (Vite) | 3403 |
| Chrome remote debugging (on kiosks) | 9222 |
| PostgreSQL | 5432 |

### Docker Build & Run
Multi-stage build: deps → builder (compiles server TS, builds admin + display Vite) → runner (Node 20 Alpine, non-root `lightman` user). Runs migrations and seeds on startup.

```bash
# Build
docker build -t lightman-app .

# Run
docker run -d --name lightman-app --net=host \
  -v /home/wipro/lightman-app01/server/storage:/app/server/storage \
  -v /home/wipro/lightman-app01/agent:/app/agent \
  -e DATABASE_URL='postgresql://postgres:postgres123@127.0.0.1:5432/lightman' \
  -e NODE_ENV=production \
  -e JWT_SECRET='CHANGE_ME_TO_A_STRONG_RANDOM_STRING_AT_LEAST_32_CHARS' \
  -e CORS_ORIGIN='*' \
  --restart unless-stopped \
  lightman-app
```

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | — | PostgreSQL connection string |
| JWT_SECRET | — | Min 32 chars |
| JWT_EXPIRY | 24h | Token lifetime |
| CORS_ORIGIN | * | Allowed origins |
| STORAGE_PATH | ./storage | Local file storage |
| S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY | — | Optional cloud storage |
| MQTT_URL | — | Optional Mosquitto integration |

## Display Template System

### How Templates Work
1. Device connects to server with its slug, deviceId, and apiKey
2. Server looks up `devices.app_id` → `apps.template_type` to determine which template to load
3. Display app's `TemplateRouter.tsx` renders the matching React component from the template registry
4. Touch templates have 30-second inactivity timeout before resetting to home

### Available Templates
app01-monophone-audio, app02-monophone-video, app03-touch-carousel, app04-media-loop, app05-interactive-map, app06-media-browser, touch-scroll, proximity, multi-screen, custom01-hilight-timeline, custom06-reception-program, custom07-osc, custom08-museum-kiosk

### Display Dev Server
```bash
cd display && npm run dev
# Opens at http://localhost:3403
# Proxies /api, /storage, /ws to localhost:3401
```

Test a specific display locally:
```
http://localhost:3403/display/a-av03?deviceId=11111111-2222-3333-4444-555555555555&apiKey=dev-api-key-a-av03
```

### Short URL
`GET /d/:slug` redirects to `/display/:slug?deviceId=xxx&apiKey=xxx` (auto-injects credentials from DB)

## Agent System

### Overview
The agent (`agent/`) is a Node.js daemon that runs on each display machine. It manages kiosk browsers, reports health, handles remote commands, and auto-updates. Current version: **v1.0.64**.

### Key Features
- **Kiosk Management**: Launches Chrome in fullscreen, crash recovery (max 10 crashes/5min), shell replacement mode
- **Multi-Screen**: Detects and manages multiple displays with screen mapping
- **Health Monitoring**: Reports CPU, memory, disk, temperature, network, OS info, screen info every 60s
- **Remote Commands**: Reboot, shutdown, restart browser, screenshots, serial port control
- **Auto-Update**: Polls server every 5 min, downloads and installs new versions automatically
- **Hardware Integration**: Serial bridge, OSC bridge, HLK-LD2410B presence sensor
- **Power Scheduling**: Cron-based shutdown/startup (default: 7PM off, 8AM on IST, 60s warning)
- **Chrome Args**: fullscreen, translate disabled, extensions disabled, autoplay allowed, remote debugging on 127.0.0.1:9222

### Presence Sensor (HLK-LD2410B)
- Auto-detects USB serial ports (COM3+ on Windows, /dev/ttyACM* or /dev/ttyUSB* on Linux)
- Baud rate: 115200
- Protocol: "Present" / "Clear" / "Ready." line-delimited messages
- 30-second retry if port not found, 10-second probe timeout per candidate
- Events forwarded to server via WebSocket and broadcast locally to Chrome

### Agent Configuration
File: `agent/agent.config.json` (device-specific, preserved across updates)
- Server URL, device slug, health interval (60s), poll interval (10s)
- Chrome path, default display URL (`http://localhost:3403/display/{slug}`)
- Power schedule (IST), crash recovery limits

### Agent Version Management
- Agent version is in `agent/package.json` (currently v1.0.64)
- All devices on v1.0.28+ have auto-update with proper auth headers

### Agent Install/Update (One-Liner)
On any Windows device, run in PowerShell as Administrator:
```powershell
powershell -ep bypass -c "irm 'http://192.168.10.100:3401/setup.ps1' | iex"
```
- **Fresh install**: Installs Node.js, Chrome, NSSM service, prompts for device slug
- **Update**: Downloads latest agent, backs up, extracts, restarts service

### Agent Deploy Pipeline
1. Edit agent code locally
2. Bump version in `agent/package.json`
3. `git push origin main`
4. SSH to server: `cd ~/lightman-app01 && git pull origin main`
5. Build agent: `cd agent && npm install && npm run build && npm prune --omit=dev`
6. Create tarball and upload for both platforms:
```bash
tar -czf /tmp/agent.tar.gz dist/ node_modules/ package.json agent.config.json
# Upload for both linux and windows via /api/agent/upload
```
7. Connected agents auto-update within 5 minutes
8. The `scripts/auto-deploy-agent.sh` automates steps 4-6 (needs TypeScript globally: `sudo npm install -g typescript`)
9. `scripts/auto-deploy-all.sh` handles server+admin+display+agent changes, rebuilds Docker if needed

### Server Rebuild (for admin UI, display, or server API changes)
```bash
cd ~/lightman-app01
git pull origin main
docker build -t lightman-app .
docker stop lightman-app && docker rm lightman-app
# Then run the docker run command above
```

### Restarting Chrome on a Kiosk
Kill Chrome via SSH — the agent auto-relaunches it with fresh content:
```bash
sshpass -p '12345Six' ssh wipro@100.124.40.69 \
  'sshpass -p "Light123" ssh -o StrictHostKeyChecking=no kiosk@192.168.10.103 "taskkill /F /IM chrome.exe"'
```

## API Endpoints

### Agent Updates
- `GET /api/agent/status?site_id=xxx` — All devices with current vs latest version, update_status
- `POST /api/agent/push-update` — Push instant update: `{"device_id":"uuid"}` or `{"all":true}`
- `GET /api/agent/check-update?current_version=x&platform=windows` — Device polls for updates (device auth)
- `POST /api/agent/upload` — Upload agent tarball (admin auth)
- `GET /api/agent/versions` — List uploaded versions
- `GET /api/agent/download/:id` — Download tarball (JWT or device auth)

### Agent Commands
- `POST /api/devices/:id/agent-command` — Send command to device agent
- `GET /api/devices/:id/agent` — Get agent info (version, health, capabilities)
- `GET /api/devices/:id/health?limit=100` — Health history

### Utility Endpoints
- `GET /setup.ps1` — Windows agent setup/update script (server URL auto-injected)
- `GET /ssh.ps1` — OpenSSH installation for Windows kiosk
- `GET /fix.ps1` — Sets agent shellMode=true, configures auto-login
- `GET /openssh.zip` — Offline OpenSSH installer
- `GET /d/:slug` — Short URL redirect to display page with credentials
- `GET /api/agent/bandwidth-test` — 1MB download for network diagnostics

### Server Middleware
- Rate limiting: 200 req/min per IP on `/api/`
- Body limit: 1MB (JSON/URL-encoded)
- Request timeout: 30s for API, 10min for uploads
- Security: Helmet (CSP/HSTS disabled for flexibility)

## Device Inventory (Museum OS Site)

| Slug | IP | Type | Notes |
|------|-----|------|-------|
| a-av01 | 192.168.10.101 | custom08-museum-kiosk | 55" display, 3840x2160, Win11 Pro |
| a-av02 | 192.168.10.102 | custom06-reception-program | Separate dev happening |
| a-av03 | 192.168.10.103 | custom01-hilight-timeline | |
| b-av01 | — | — | No MAC/IP |
| b-av02 | 192.168.10.104 | custom07-osc | |
| c-av01 | 192.168.10.105 | app04-media-loop | |
| c-av02 | 192.168.10.106 | app03-touch-carousel | GeneralSans font |
| c-av03 | 192.168.10.107 | app03-touch-carousel | GeneralSans font |
| d-av01 | 192.168.10.108 | custom06-reception-program | |
| d-av02 | 192.168.10.110 | touch-scroll | GeneralSans font |

### Kiosk Hardware (typical)
- **CPU**: Intel i5-14500T (14 cores / 20 threads, 1.7 GHz)
- **RAM**: 32 GB
- **GPU**: Intel UHD 770 (integrated, 2GB VRAM)
- **OS**: Windows 11 Pro

## Access

### Server
- **SSH**: `sshpass -p '12345Six' ssh wipro@100.124.40.69` (via Tailscale)
- **Admin UI**: `http://192.168.10.100:3401` (LAN) or `http://100.124.40.69:3401` (Tailscale)
- **Admin Login**: `admin@museumos.local` / `admin123`

### Kiosks (via server jump)
- **User**: `kiosk` / **Password**: `Light123`
- **SSH**: `sshpass -p "Light123" ssh -o StrictHostKeyChecking=no kiosk@192.168.10.10x`
- Must SSH via server first (kiosks are on LAN only)

## Performance Notes
- **CSS `drop-shadow` filter** on animated elements kills FPS on integrated Intel GPUs (21fps → 56fps when disabled). Currently disabled on dandelion components.
- **Canvas pre-rendering** (DandelionCanvasRenderer) pre-renders breathing frames as offscreen canvases to avoid per-frame SVG path calculations. 70 frames at 67ms interval for slow dreamy breathing.
- Chrome remote debugging (port 9222) can be used to measure FPS via DevTools protocol. A `fps.ps1` script is deployed to kiosks for this.

## FPS Measurement (on kiosks)
Upload and run via SSH:
```bash
sshpass -p "Light123" scp fps.ps1 kiosk@192.168.10.103:C:/Users/kiosk/fps.ps1
sshpass -p "Light123" ssh kiosk@192.168.10.103 "powershell -ExecutionPolicy Bypass -File C:\\Users\\kiosk\\fps.ps1"
```

## External Repos
- `cft-yamuna/wipro-agent-final` — Original standalone agent repo (now merged into `agent/` here)

## Tech Stack
- **Server**: Express.js, TypeScript, Knex.js, PostgreSQL, WebSocket
- **Admin**: React 19, TypeScript, Tailwind CSS, Vite, Zustand, TanStack Query
- **Display**: React, Vite, Framer Motion, GSAP
- **Agent**: Node.js, TypeScript, systeminformation, ws, zod
- **Infra**: Docker, NSSM (Windows service manager), systemd (Linux)

# currentDate
Today's date is 2026-04-11.
