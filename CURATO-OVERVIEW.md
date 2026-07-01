# Curato — Complete System Documentation

> A single platform to run every screen, kiosk, and audio point in a museum — from one dashboard, on the local network, with no cloud dependency required.

This document is written in two layers:

- **Part A — Non-Technical Overview**: what the system does, in plain language, for decision-makers and museum staff.
- **Part B — Technical Reference**: the architecture, components, and feature inventory for engineers.

---

## ⚠️ Important Notes Before You Read

A few things to keep in mind about the current state of the project:

1. **The CMS is fully tested and working.** The content management system — the admin dashboard, content/media management, scheduling, device control, monitoring, display templates, provisioning, backups, and auto-updates — has been built and tested end-to-end. This is the core, mature part of the product.

2. **It is production-ready.** The whole stack ships as **one `.exe` installation** per device. Once installed, devices **keep themselves updated with one click** from the dashboard. The server takes **automatic backups of all data**, so nothing is lost. **Provisioning a new screen is extremely simple** (details below).

3. **The "Hardware" section in the admin panel is NOT confirmed.** This is the part of the dashboard that controls *physical AV equipment directly over the network* — projectors, signage displays, and lighting — through device "drivers" (PJLink, Samsung SSSP/MDC, DALI, etc.), plus the Hardware Catalog and fleet Diagnostics built on top of it. The code is **complete, but it has never been validated against the real equipment**, and several drivers are deliberate placeholders. They may need rework, and we would benefit from **guidance from someone who knows the specific AV hardware and its control protocols** before relying on this section. Treat the admin **Hardware / device-driver control** layer as *experimental / needs validation*. (The rest of the CMS — content, scheduling, monitoring, kiosk display, PC-agent control — is tested and working.)

---

# PART A — Non-Technical Overview

## What Is Curato?

Curato is the "operating system" for a museum's displays. A typical museum has dozens of screens, touch kiosks, audio handsets, and projectors spread across galleries. Normally each one is managed by hand — someone walks around with a USB stick, turns screens on and off, and hopes nothing crashed overnight.

Curato replaces all of that with **one web dashboard** that runs on the museum's own network. From a single browser tab a staff member can:

- See every screen in the building and whether it's healthy or has a problem.
- Upload videos, images, and PDFs and push them to any screen.
- Build slideshows ("playlists") and assign them to displays.
- Turn screens on automatically each morning and off each night.
- Watch live health stats (is a screen overheating? offline? out of disk?).
- See how visitors are engaging (how many interactions, how long they linger).
- Control everything remotely — restart a frozen kiosk without leaving the office.

## The Four Parts (in plain language)

| Part | What it is | Who touches it |
|------|-----------|----------------|
| **The Server** | The "brain." A small program that runs on one computer at the museum and coordinates everything. | Installed once by IT |
| **The Admin Dashboard** | The website staff log into to manage everything. | Daily use by staff |
| **The Display** | What actually appears on each museum screen (the slideshow, the touch kiosk, the map, etc.). | Visitors see it |
| **The Agent** | A tiny background helper installed on each screen's computer. It does what the dashboard tells it, reports health, and keeps itself updated. | Invisible, automatic |

## Why It's Production-Ready

### ✅ One-EXE Installation
Setting up a new museum screen is a **single installer**. Run it once on the screen's PC, type the screen's name, and the machine becomes a fully managed kiosk — it launches the right content full-screen, registers itself with the server, and starts reporting in. No manual configuration of browsers, startup scripts, or services.

### ✅ One-Click Updates
When the software improves, you don't visit each screen. The dashboard shows every device's current version, and **one click pushes the update** to a single screen or the entire fleet. Each device downloads, verifies, and installs the new version itself. If an update ever fails to start, the device **automatically rolls back** to the previous working version — so a bad update can't brick a screen.

### ✅ Automatic Backups
The server **backs up the entire database to a file on a schedule** (e.g. every night at 2 AM), keeps a rolling history, and can restore from any backup. Your content assignments, schedules, device list, and settings are safe. Backups are plain, human-readable files — easy to copy off-site or move to a new server.

### ✅ Dead-Simple Provisioning
Adding a screen is designed to be foolproof:
- The installer registers the device automatically if it recognizes it on the network, **or**
- It shows a short **pairing code** on the screen that a staff member confirms once in the dashboard.

After that, the screen remembers who it is forever — even across reboots and updates.

### ✅ Runs On-Premise, No Cloud Needed
Everything — the server, the database, the content storage — runs on the museum's own network. No internet connection is required for day-to-day operation. (Cloud storage is *optional* if a museum wants it.)

## What Visitors Actually See

The "Display" side comes with many ready-made experience types ("templates"). A few examples:

- **Touch carousel** — a slideshow visitors can swipe through.
- **Media loop** — a video that plays on a loop all day.
- **Interactive map** — a touchable floor map with clickable points of interest.
- **Media browser** — a gallery visitors browse through images, videos, and PDFs.
- **Museum kiosk** — a full wayfinding kiosk with categories, galleries, and a map.
- **Reception program** — a welcome screen showing guest names and information.
- **Audio handset** — pick up a phone-style handset and hear a recording *(hardware-dependent — see warning above)*.
- **Interactive timeline** — an animated historical timeline.

Staff pick which experience runs on each screen from the dashboard, and can change it any time.

## What Staff Can Do From the Dashboard

- **Dashboard** — one-glance health of the whole building.
- **Devices** — see, control, and troubleshoot every screen.
- **Content Library** — upload and organize all media, with version history.
- **Playlists** — build ordered slideshows with transitions.
- **Schedules** — automate power on/off and content changes by time of day.
- **Apps** — configure what experience each screen runs.
- **Groups & Zones** — organize screens by gallery or section.
- **Alerts** — get notified when something goes wrong.
- **Analytics** — track screen health over time.
- **Engagement** — see how visitors interact and how long they stay.
- **Users** — manage staff accounts and what each person is allowed to do.
- **Logs & Audit** — a full record of who did what and when.
- **Recycle Bin** — recover anything deleted within 30 days.

---

# PART B — Technical Reference

## Architecture Overview

Curato is a four-component system running on the museum's local network:

```
                 ┌────────────────────────────────────────────┐
                 │            Server (Docker)                  │
                 │  Express + TypeScript API  ·  Port 3401     │
                 │  PostgreSQL 16  ·  WebSocket hub  ·  Storage│
                 └───────┬───────────────┬───────────────┬─────┘
                         │ Admin WS      │ Display WS     │ Agent WS
                 ┌───────▼──────┐ ┌──────▼──────┐ ┌───────▼────────┐
                 │  Admin UI    │ │  Display    │ │   Agent        │
                 │ React 19 SPA │ │ React SPA   │ │ Node daemon    │
                 │ (staff)      │ │ (on screens)│ │ (on each PC)   │
                 └──────────────┘ └─────────────┘ └────────────────┘
```

### Tech Stack
- **Server**: Express.js, TypeScript, Knex.js, PostgreSQL 16, WebSocket (`ws`)
- **Admin**: React 19, TypeScript, Tailwind CSS, Vite, Zustand, TanStack Query, Framer Motion
- **Display**: React, Vite, Framer Motion, GSAP
- **Agent**: Node.js, TypeScript, `systeminformation`, `ws`, `zod`
- **Infra**: Docker, NSSM (Windows service manager), systemd (Linux)

### Ports
| Service | Port |
|---------|------|
| Server API / Admin UI | 3401 |
| Display dev server (Vite) | 3403 |
| Local event server (agent → Chrome) | 3402 |
| Chrome remote debugging (kiosks) | 9222 |
| PostgreSQL | 5432 |
| MQTT (optional) | 1883 / 1884 |

### Three WebSocket Channels
The server runs three separate real-time channels so each audience gets only what it needs:
- **Admin WS** (`server/src/services/adminWs.ts`) — pushes device status, alerts, and schedule progress to the dashboard.
- **Display WS** (`server/src/services/displayWs.ts`) — pushes app config + playlist manifests to screens; receives clicks/hardware events.
- **Agent WS** (`server/src/services/agentWs.ts`) — bidirectional command/response with device agents; receives health and telemetry.

---

## Component 1 — Server (`server/`)

Express + TypeScript API in a Docker container (`curato-app`), backed by PostgreSQL (`curato-db`). Runs migrations and seeds on startup.

### API Route Groups
| Area | File | Responsibility |
|------|------|----------------|
| Auth | `routes/auth.ts` | JWT login, 2FA (TOTP), password change, brute-force lockout, token revocation |
| Users | `routes/users.ts` | CRUD + role-based access (super_admin, site_admin, content_manager, operator) |
| Devices | `routes/devices.ts` | Registration, pairing, status, hardware info, power topology |
| Agent commands | `routes/agentCommands.ts` | Allowlisted remote commands (power, kiosk, network, sensors) with request/response |
| Device logs | `routes/deviceLogs.ts` | Event logs + health history |
| Groups | `routes/groups.ts` | Device groups / zones |
| Sites | `routes/sites.ts` | Multi-tenant sites, floors, spatial layout, timezones |
| Content | `routes/content.ts`, `routes/contentVersions.ts` | Media items with SHA-256-hashed version control |
| Playlists | `routes/playlists.ts` | Ordered content + transitions; manifest assembly (`lib/playlistAssembly.ts`) |
| Schedules | `routes/schedules.ts` | Cron-based power/content/maintenance jobs |
| Power | `routes/power.ts` | Staggered power-on, WOL, multi-driver power routing, cascades |
| Alerts | `routes/alerts.ts` | Alert creation/acknowledgment by severity |
| Health | `routes/health.ts` | Public + protected health checks |
| Analytics | `routes/analytics.ts` | Fleet KPIs, time-series, CSV export |
| Engagement | `routes/engagement.ts` | Interactions, dwell time, occupancy rollups |
| Apps | `routes/apps.ts` | Template type + config JSON per app |
| Catalog | `routes/catalog.ts` | Hardware parts reference (brand/model/protocol/driver) |
| Storage | `routes/storage.ts` | Upload/download via fs or S3 backend |
| Audit logs | `routes/auditLogs.ts` | All user actions with IP attribution |
| Lighting | `routes/lighting.ts` | DALI addressable lighting control |
| Diagnostics | `routes/diagnostics.ts` | Staggered restarts, attestation, cache refresh |
| System | `routes/system.ts` | Server self-update trigger |
| Reception | `routes/reception.ts` | Group-size prompt / occupancy |
| Heartbeat | `routes/heartbeat.ts` | Device last-seen tracking |
| DB transfer | `routes/dbTransfer.ts` | Export/import entire DB as JSON |

### Authentication & Authorization
- JWT-based, scoped per site; `super_admin` bypasses site checks.
- Rate limiting: 5 login attempts/min/IP; 10 failures → 15-min lockout.
- 2FA via TOTP (RFC 6238) — `lib/totp.ts`.
- Token revocation tracked in `revoked_tokens`.
- **Devices** authenticate with long-lived **API keys** (not JWTs) for provisioning and health reporting.

### Database Schema (key tables)
Migrations in `server/migrations/`. Core groups:
- **Core**: `sites`, `devices`, `device_groups`, `device_group_members`, `floors`, `users`, `content`, `content_versions`, `playlists`, `playlist_items`, `apps`.
- **Health/monitoring**: `device_health`, `alerts`, `audit_logs`, `device_logs`.
- **Scheduling/engagement**: `schedules`, `engagement_rollup`, `presence_events`, `interaction_events`.
- **Config/security**: `device_agent_versions`, `catalog_parts`, `revoked_tokens`, `user_totp_secrets`.

### Storage Backend (`services/storage.ts`)
Abstracted `StorageBackend` interface with two implementations:
- **Filesystem** (`services/fsBackend.ts`) — Docker bind-mounted directory (default).
- **S3** (`services/s3Backend.ts`) — optional AWS S3 with configurable bucket/prefix.
Selected via `STORAGE_BACKEND=fs|s3`. Every content version has a unique path + SHA-256 hash.

### Health Monitoring & Alerting
- **Health aggregator** (`services/healthAggregator.ts`) — collects per-device CPU/mem/disk/temp/uptime; stores latest in `devices.last_health` and history in `device_health`.
- **Alert monitor** (`services/alertMonitor.ts`) — threshold-based alerts (offline, high temp/CPU, low disk), severity-tagged, pushed to admins over WebSocket.

### Device Control — Driver Layer (`services/deviceManager.ts`) ⚠️ NEEDS HARDWARE VALIDATION
> **This is the "Hardware" feature exposed in the admin panel. It controls physical AV equipment directly over the network. The code is complete but has not been tested against real projectors/displays/lighting — see the warning at the top of this doc.**

Unified `deviceManager.command(deviceId, action, args)` routes to a driver based on the device's `driver_family`:
`agent`, `pjlink`, `sssp`, `samsung-mdc`, `dali`, `lg-signage`, `epson-escvp21`, `symetrix`, `genelec-smartip`, `curato-controller`, `passive`.
Drivers live in `server/src/drivers/` and `server/src/services/` (`pjlink.ts`, `sssp.ts`, `dali.ts`, …). The admin code never needs to know the underlying hardware protocol — it just asks for `volume`, `brightness`, `input`, `power`, `restart`, `attest`, etc.

- **`agent`** — Curato agent on PCs/kiosks. **This driver is tested and working** (it's the same channel that runs the displays).
- **`pjlink`** (`services/pjlink.ts`) — projectors over the PJLink TCP protocol. *Implemented, not hardware-validated.*
- **`sssp`** (`services/sssp.ts`) — Samsung signage over SSSP HTTP. *Implemented, not hardware-validated.*
- **`samsung-mdc`** (`drivers/samsung-mdc/`) — Samsung over MDC TCP. *Implemented, not hardware-validated.*
- **`dali`** (`services/dali.ts`) — DALI-2 lighting gateway. *Implemented, not hardware-validated.*
- **`lg-signage`, `epson-escvp21`, `symetrix`, `genelec-smartip`, `curato-controller`** — **deliberate placeholders** (`drivers/pending.ts`); they throw a `DriverError` until a real driver is written. These explicitly **await hardware and guidance**.
- **`passive`** — no direct control; status is inherited from its power-cascade parent.

This driver layer is surfaced in the admin UI through three places: the **Hardware Catalog** page, the **Diagnostics** page, and the per-device **DeviceControlPanel** (see the Admin UI section below).

### Scheduling & Power
- **Scheduler** (`services/scheduler.ts`) — node-cron jobs loaded at startup, per-site timezones (default `Asia/Kolkata`), staggered execution, actions: `power_on/off`, `push_content`, `set_playlist`, `restart`, `set_config`.
- **Power cascade** (`services/powerCascade.ts`) — parent→child power-on order, reverse for power-off, configurable delays.
- **Wake-on-LAN** (`services/wol.ts`, `services/deviceWake.ts`) — magic packets to offline devices.
- **Staggered startup** — power-on can be "back-timed" to opening hour (each device N seconds apart).

### Backup & Restore — Production-Grade
- **Backup service** (`services/backupService.ts`) — exports the full database to timestamped JSON, keeps a `latest.json` pointer, prunes to last N (default 30), runs on a cron (`BACKUP_CRON`, e.g. `0 2 * * *`) plus 30s after startup.
- **DB transfer** (`routes/dbTransfer.ts`, `services/dbJsonTransfer.ts`) — `GET /api/db-transfer/export` / `POST /api/db-transfer/import`, plus CLI `npm run db:import:json`. Human-readable JSON makes disaster recovery and server migration trivial.

### Agent Update Distribution
- **Update endpoint** (`routes/agentUpdates.ts`) — `GET /api/agent/check-update?current_version=X&platform=windows|linux` returns version, SHA-256 checksum, and download URL; agent auth via device API key.
- **Version inventory** — `device_agent_versions` table tracks released versions per platform (stable/beta/deprecated + notes).

### Middleware
Rate limiting (200 req/min/IP on `/api/`), 1 MB body limit, 30 s API timeout (10 min for uploads), Helmet (CSP/HSTS relaxed for flexibility), `validateBody`/`validateQuery`/`authUser`/`requireRole`.

---

## Component 2 — Admin UI (`admin/`)

React 19 + TypeScript + Tailwind + Vite SPA served from the server container. ~28 pages.

### Pages (`admin/src/pages/`)
| Page | Purpose |
|------|---------|
| `DashboardPage` | Fleet health, open alerts, active apps, "needs attention" panel, 24h activity |
| `DeviceListPage` / `DeviceDetailPage` / `DeviceCreatePage` | List/search/bulk-control devices; detail with agent stats + commands; provision new |
| `ContentListPage` / `ContentDetailPage` | Media library, drag-drop upload, version history, direct assignment |
| `PlaylistListPage` / `PlaylistEditorPage` | Drag-to-reorder playlists, per-item transitions + duration |
| `ScheduleListPage` / `ScheduleEditorPage` | Cron builder with human-readable output; 5 schedule types |
| `AppListPage` / `AppEditorPage` | Per-template config panels, soft-delete with 30-day recycle bin |
| `GroupsPage` | Device groups/zones, bulk actions |
| `AlertsPage` | Filter by severity/type/status, acknowledge, paginated, live updates |
| `AnalyticsPage` | CPU/mem/temp trends, per-zone heatmap, 24h–30d windows |
| `EngagementPage` | Interactions, dwell time, busiest-hour heatmap |
| `UsersPage` | Role management (4 roles), add/edit/delete |
| `HardwareCatalogPage` ⚠️ | **Hardware** catalog — registry of AV parts + driver mapping (see Hardware section) |
| `DiagnosticsPage` ⚠️ | Fleet maintenance via the driver layer — restart-all, attest fleet, clear caches |
| `SettingsPage` | Site config, timezone, MQTT, DB backup/restore |
| `ReceptionEditorPage` | Multi-screen reception/welcome config |
| `LogsPage` | Audit log + per-device logs, filterable, paginated |
| `RecycleBinPage` | Restore/purge soft-deleted apps (30-day retention) |
| `ChangePasswordPage` | Forced first-login password change |
| `InstallationGuidePage` | In-app setup walkthrough |

### ⚠️ The "Hardware" Feature (admin panel) — NEEDS VALIDATION
This is the dashboard section flagged at the top of the doc. It was added in the most recent `hardware` commit and is a brand-agnostic **device-driver + hardware-catalog** system. Three surfaces:

1. **Hardware Catalog** (`pages/HardwareCatalogPage.tsx`, server `routes/catalog.ts`, table `catalog_parts`) — a registry of AV part numbers (brand, model, category, platform, control protocol, `driver_family`, default port, capabilities). Acts as the source of truth for which driver/defaults to use when adding a device. Full CRUD, role-gated (site_admin+). Ships seeded with sample parts (Samsung QM55R, generic PJLink projector, i5 kiosk PC, DALI-2 gateway, Samsung MDC).
2. **Diagnostics** (`pages/DiagnosticsPage.tsx`, server `routes/diagnostics.ts`) — fleet-wide actions routed through the driver layer: **Restart All** (staggered), **Attest Fleet**, **Clear Caches**, with per-device success/failure results.
3. **DeviceControlPanel** (`components/DeviceControlPanel.tsx`, embedded in `DeviceDetailPage`) — capability-driven control of a single device: queries `GET /api/devices/:id/capabilities` and renders only the controls that device's driver exposes (volume, brightness, mute, input, power), plus live telemetry (temp, CPU%, lamp hours, uptime, firmware). Commands go through `POST /api/devices/:id/command`.

**Status:** code is complete with proper validation, role-gating, and audit logging — **but the actual control of physical projectors/displays/lighting (PJLink, SSSP, Samsung MDC, DALI) has not been verified against real equipment, and five drivers are intentional placeholders.** The PC **`agent`** driver path *is* tested. Everything here that talks to non-PC AV gear should be treated as needing on-site validation and hardware expertise. See *Device Control — Driver Layer* above for the per-driver breakdown.

### State & Data
- **Zustand stores** (`admin/src/stores/`): `auth`, `site`, `theme`, `toast`, `deviceSync` (live per-device cache-refresh state).
- **API client** (`lib/api.ts`) — REST with Bearer auth, FormData uploads with progress.
- **WebSocket** (`lib/ws.ts`) — subscribes to `device:status`, `alert:*`, `agent:status`, `config:updated`; invalidates React Query caches on events.
- **TanStack Query** — 30 s stale time, namespaced keys `[entity, siteId, …]`, 60–120 s refetch for long-lived data.

---

## Component 3 — Display (`display/`)

React + Vite SPA served at `/display/:slug`, shown full-screen on each kiosk. A `TemplateRouter` (`components/TemplateRouter.tsx`) maps `templateType` → React component, applies a 30-second inactivity timeout on touch templates, and re-keys the component on config revision changes.

### Connection / Provisioning Flow
1. Display boots at `/display/{slug}`.
2. Checks `localStorage` (slug-scoped) for `deviceId`/`apiKey`.
3. If missing → `ProvisioningScreen`: calls `GET /api/devices/provision/{slug}`.
4. Auto-provisions if recognized, otherwise shows a **pairing code** and polls (3 s) for admin approval.
5. On success, stores credentials; `AppShell` fetches config and connects the Display WS for live updates.
6. **Short URL**: `GET /d/:slug` redirects to the full display URL with credentials auto-injected from the DB.

### Templates (`display/src/templates/`)
**Catalog apps:**
| Template | What it shows |
|----------|---------------|
| `app01-monophone-audio` | Audio triggered by handset pickup / buttons *(hardware)* |
| `app02-monophone-video` | Video triggered by handset / touch *(hardware/touch)* |
| `app03-touch-carousel` | Swipeable carousel / slideshow / document viewer |
| `app04-media-loop` | Looping video or slideshow, no interaction |
| `app05-interactive-map` | Touchable map with hotspots |
| `app06-media-browser` | Browsable gallery of images/videos/PDFs |

**Shared/utility:** `proximity` (sensor-triggered *hardware*), `touch-scroll` (scrollable bilingual content), `multi-screen` (synced across displays).

**Custom:** `custom01-hilight-timeline` (animated timeline + dandelion viz, GSAP/Canvas), `custom06-reception-program` (multi-screen welcome), `custom07-osc` (OSC-triggered *hardware*), `custom08-museum-kiosk` (wayfinding kiosk).

**Builder:** `custom-builder` — data-driven layout rendered from config JSON (no code).

### Core Components & Hooks
- **`AppShell`** — provisioning, config fetch, WS connection, fullscreen, error boundary (max 3 retries, rapid-error backoff), fallback playlist.
- **`IdleScreen`** — scheduled idle/screensaver overlay (activeFrom/activeTo + timezone).
- Reusable media: `VideoPlayer`, `ImageSlide`, `TransitionLayer`, `ErrorScreen`, `LoadingScreen`.
- **Hooks** (`display/src/hooks/`): `usePlaylist`, `useIdleTimer`, `useHeartbeat`, `useContentUpdates`, `useWebSocket`, `useWatchdog`, `useInteractionTelemetry`, `useExhibitSync`, plus the hardware MQTT hooks (`useMonophone`, `useButtonPanel`, `useProximity`, `useOscTrigger`, `usePresenceSensor`).

### Offline / Caching
- `offlineCache.ts` — IndexedDB cache of config + state (24 h expiry), falls back to cache if server unreachable.
- `mediaCache.ts` — HTTP cache headers / optional service worker for offline media.

---

## Component 4 — Agent (`agent/`)

Node.js daemon on each display PC — Windows Service (via NSSM) or systemd unit. Current version **v1.0.64**. Holds a persistent WebSocket to the server. Entry: `agent/src/index.ts`.

### Provisioning & Install (the "one-EXE" story)
- **One-liner / installer**: server serves `GET /setup.ps1` (and `setup-main.ps1`, `setup-bootstrap.ps1`) with the server URL auto-injected. On Windows, run as admin:
  ```powershell
  powershell -ep bypass -c "irm 'http://<server>:3401/setup.ps1' | iex"
  ```
- **Windows setup** (`agent/scripts/setup-windows.ps1`): installs Node + Chrome, creates `C:\Program Files\Curato\Agent\`, downloads + extracts the release, registers the NSSM service, configures kiosk auto-login, installs OpenSSH, and starts the service.
- **Linux** (`agent/scripts/install-linux.sh`, `install-rpi.sh`): systemd unit + dedicated user + Chromium deps.
- **Power-only devices** (`agent/scripts/setup-device-power-only.ps1`): minimal agent (WOL + health + power, no kiosk).
- **Provisioning service** (`agent/src/services/provisioning.ts`): auto-provisions by recognized IP, else shows a pairing code and polls for approval (600 s timeout). Identity is cached to `agent.config.json` so reboots and updates keep the same device ID.

### Kiosk Management (`services/kiosk.ts`, `multiScreenKiosk.ts`)
Launches Chrome/Chromium full-screen kiosk, monitors crashes (max 10 crashes / 5 min → stop auto-restart), navigates/screenshots on command, and supports **one Chrome per connected display** for multi-screen exhibits. Chrome args: fullscreen, translate/extensions disabled, autoplay allowed, remote debugging on 127.0.0.1:9222.

### Auto-Update (the "one-click update" story)
- **AutoUpdater** (`services/autoUpdater.ts`): polls `GET /api/agent/check-update` every 5 min (device API-key auth). Downloads → verifies SHA-256 → extracts to staging → swaps directories → restarts (NSSM/systemd).
- **Crash-loop protection** (`services/updater.ts`): boot count tracked in `.agent-update-state.json` (survives the directory swap). If 3 boots fail, it **automatically rolls back** to the previous version. `MAX_BOOT_ATTEMPTS = 3`.
- Admins can also push instantly: `POST /api/agent/push-update {"device_id":...}` or `{"all":true}`.

### Watchdog & Health
- **Watchdog** (`services/watchdog.ts`): restarts crashed kiosks, restarts the agent on high memory, cleans disk/Chrome cache when full, reconnects a dead WebSocket — all with cooldowns to avoid thrashing.
- **Health monitor** (`services/health.ts`): CPU/mem/disk/temp/uptime every ~30–60 s via OS-native commands, sent over `agent:health`.
- **Log forwarder** (`services/logForwarder.ts`): batches agent logs to the server (`device_logs`).

### Power Scheduling (`services/powerScheduler.ts`)
Local cron (default 7 PM off / 8 AM on IST, 60 s warning), checked every 30 s; also obeys server-pushed `system:shutdown`. Remote schedule updates gated behind an env flag.

### Remote Commands (`agent/src/commands/`)
Display (brightness/power/rotate/volume), kiosk (launch/kill/navigate/restart/screenshot), system (shutdown/reboot/suspend), network diagnostics (ping/bandwidth/dns/interfaces), and hardware/sensor/serial toggles — all allowlisted on the server side.

### Agent-Side Hardware Bridges (sensors / serial / OSC)
> These are the agent's *local* hardware bridges — separate from the admin-panel "Hardware" feature. Like any hardware-dependent code they should be confirmed against the actual peripherals on site, but they are not the primary item flagged at the top of this doc.

- **Serial bridge** (`services/serialBridge.ts`): reads a COM port and maps characters to events — `*`→handset pickup, `#`→hangup, `1-9`→button press; line words `Present`/`Clear`/`Ready.`→sensor events. Uses PowerShell on Windows (no native deps). Forwards as `serial-bridge:event`.
- **Presence sensor** (`services/presenceSensor.ts`): HLK-LD2410B on a XIAO ESP32C3 over USB serial, 115200 baud, auto-detects COM ports, present/clear/unknown state machine with reconnect.
- **OSC bridge** (`services/oscBridge.ts`): UDP listener parsing OSC wire format; emits `osc:trigger` when a watched address arrives with arg `1`. Uses Node's built-in `dgram`.

These feed the display templates `proximity`, `app01/02-monophone-*`, and `custom07-osc`, plus the engagement analytics (presence/interaction events).

---

## Key Architectural Patterns

1. **Unified device abstraction** — one driver layer routes commands to agents, projectors (PJLink), Samsung displays (SSSP/MDC), DALI lighting, etc.
2. **WebSocket-first real-time** — three persistent channels; state changes broadcast immediately.
3. **Declarative app config** — apps = `template_type` + config JSON; server computes the manifest, agent runs the template in Chrome.
4. **Crash-loop recovery** — agents auto-rollback bad updates via persistent boot-count tracking.
5. **Staggered sequential control** — power-on back-timed to opening hour with per-device stagger and parent→child cascade.
6. **Multi-tenant site scoping** — all data keyed by `site_id`; per-site user access.
7. **DB-as-JSON backups** — entire database exported/imported as portable, human-readable JSON.

---

## Build, Run & Deploy (local)

**Server / Admin / Display** (rebuild + restart the app container after a change):
```bash
# Windows (Docker Desktop) — or just double-click deploy-local.bat
docker compose --env-file .env.production up -d --build curato-app
# Linux
docker compose -f docker-compose.linux.yml --env-file .env.production up -d --build curato-app
```
Served at `http://localhost:3401`. Fresh clone: run `setup-all.bat` once.

**Agent** (after bumping `agent/package.json`):
```bash
cd agent && npm install && npm run build && npm prune --omit=dev
tar -czf agent.tar.gz dist/ node_modules/ package.json agent.config.json
# Upload for windows + linux via POST /api/agent/upload — connected agents auto-update within 5 min
```

**Display dev server**:
```bash
cd display && npm run dev   # http://localhost:3403, proxies /api /storage /ws to :3401
```

---

## Summary

| Capability | Status |
|------------|--------|
| Admin dashboard, content, scheduling, monitoring | ✅ Tested & working |
| Display templates (touch, loop, map, kiosk, etc.) | ✅ Tested & working |
| One-EXE device installation | ✅ Production-ready |
| One-click / automatic fleet updates + rollback | ✅ Production-ready |
| Automatic scheduled database backups | ✅ Production-ready |
| Simple provisioning (auto / pairing code) | ✅ Production-ready |
| On-premise, no-cloud operation | ✅ Production-ready |
| PC/kiosk control via the `agent` driver | ✅ Tested & working |
| **Admin "Hardware" feature** — driver control of projectors/displays/lighting (PJLink, SSSP, Samsung MDC, DALI) | ⚠️ **Untested — needs hardware validation** |
| Admin "Hardware" — placeholder drivers (LG, Epson, Symetrix, Genelec, Curato) | ⚠️ Intentional stubs — await hardware + guidance |
| Hardware Catalog + fleet Diagnostics UI | ✅ Code complete, but only as useful as the drivers above |
| Agent-side sensor/serial/OSC bridges | ⚙️ Hardware-dependent — confirm against on-site peripherals |

**Bottom line:** The CMS — the part that runs, schedules, monitors, updates, and backs up the museum's screens, and controls PC-based kiosks — is mature, tested, and production-ready, with a one-installer setup and one-click updates. The **"Hardware" section of the admin panel** — the device-driver layer that controls physical AV equipment (projectors, signage displays, lighting) over the network — is fully coded but **has not been validated against real equipment**, and several drivers are deliberate placeholders. That section would benefit from expert guidance and on-site testing before it's depended upon.
