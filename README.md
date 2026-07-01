# Curato — Museum AV Control System

108 AV installations across 12 museum zones, managed from one admin panel.

---

## What Is This?

Each museum installation (a screen with audio, a video wall, a touchscreen kiosk) is one **device** running one **app**. This system lets you:

1. **Upload content** (audio, video, images) to the server
2. **Create an app** from a template (choose APP 01–06)
3. **Assign the app to a device** (a laptop/screen in the museum)
4. The device **automatically loads and plays** the assigned content

---

## The 6 App Templates

| Template | What It Does | Installations |
|----------|-------------|:---:|
| **APP 01** — Monophone Audio | Visitor picks up handset → audio plays. Supports single-story or multi-button mode. | ~26 |
| **APP 02** — Monophone Video | Visitor picks up handset → video plays on screen with audio in handset. | ~24 |
| **APP 03** — Touch Carousel | Auto-playing slideshow. Touch to pause, swipe through thumbnails. | ~18 |
| **APP 04** — Media Loop | Zero interaction — video/slideshow loops forever. Signage. | ~14 |
| **APP 05** — Interactive Map | Touchscreen map with hotspots. Touch a zone → details popup. | 3 |
| **APP 06** — Media Browser | Browsable gallery of PDFs, photos, videos. Category filter + search. | ~10 |

Full details of every installation: see **Curato-App-Catalog.md**

---

## Project Structure

```
curato-app01/
├── server/          Express + PostgreSQL backend (port 3401)
├── admin/           React admin dashboard (port 3402)
├── display/         React display client — runs on museum devices (port 3403)
├── agent/           Node.js daemon — runs on each museum laptop
└── docs/            Detailed API & system documentation
```

---

## Quick Start (Development)

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- npm

### 1. Database
```bash
createdb curato
cd server
cp .env.example .env          # edit DATABASE_URL if needed
npm install
npm run migrate               # create tables
npm run seed                  # load demo data
```

### 2. Start All Services
```bash
# Terminal 1 — Server
cd server && npm run dev      # → http://localhost:3401

# Terminal 2 — Admin Panel
cd admin && npm run dev       # → http://localhost:3402

# Terminal 3 — Display Client
cd display && npm run dev     # → http://localhost:3403
```

### 3. Login
- URL: http://localhost:3402
- Email: `admin@curato.local`
- Password: `admin123`

---

## How To Create An Installation (Example: D-AV03)

D-AV03 is "People Garden" — a multi-button monophone audio player in the Ambition zone.

### Step 1: Upload Audio
1. Go to **Media** page in admin
2. Upload your audio files (welcome message + one per button)

### Step 2: Create the App
1. Go to **Apps** → **New App**
2. Name: `D-AV03 People Garden`
3. Template: **APP 01 — Monophone Audio (Multi-Button)**
4. Configure:
   - **Controller ID**: your ESP32 device ID (or leave empty for testing)
   - **Startup Delay**: 1 sec
   - **Auto-replay**: checked
   - **Welcome Message**: pick the welcome audio
   - **Buttons**: click "Add Button" for each story, pick the audio file
5. Click **Create**

### Step 3: Register a Device
1. Go to **Devices** → **New Device**
2. Name: `D-AV03 People Garden`
3. Slug: `d-av03-people-garden`
4. Type: `kiosk`

### Step 4: Assign App to Device
1. Go to **Devices** → click the device
2. In the dropdown, select `D-AV03 People Garden`
3. Save

### Step 5: Open the Display
Open in a browser:
```
http://localhost:3403/display/d-av03-people-garden
```
The display will provision itself and load the app. For multi-button mode, tap the buttons on screen to test.

---

## How It Works (Technical Flow)

```
┌─ ADMIN ─────────────────────────────────────────────┐
│  Upload Content → Create App → Assign to Device     │
│  POST /api/content  POST /api/apps  PUT /api/devices│
└─────────────────────────┬───────────────────────────┘
                          │ WebSocket: command:navigate
                          ▼
┌─ DISPLAY (browser on device) ───────────────────────┐
│  /display/{slug}                                     │
│  1. Provision (get deviceId + apiKey)                │
│  2. Fetch config: GET /api/devices/{id}/config       │
│  3. TemplateRouter loads the right template          │
│  4. Template renders content, listens for MQTT       │
│  5. Heartbeat every 30s                              │
└─────────────────────────────────────────────────────┘
```

**Key URLs:**
- Admin: `http://localhost:3402`
- Display: `http://localhost:3403/display/{device-slug}`
- API: `http://localhost:3401/api/...`
- Storage: `http://localhost:3401/storage/...`

---

## Hardware Integration

Museum devices use **ESP32 microcontrollers** for physical interactions:
- **Monophone pickup/hangup** → MQTT `monophone:pickup` / `monophone:hangup`
- **Button press** → MQTT `button:press` with buttonId
- **Proximity sensor** → MQTT `proximity:enter` / `proximity:leave`

The display client subscribes to MQTT via the server and reacts in real-time.

For **testing without hardware**: multi-button mode supports touchscreen taps directly.

---

## Key Concepts

| Concept | What It Is |
|---------|-----------|
| **Site** | A museum location. All content, apps, devices belong to a site. |
| **Content** | An uploaded file (audio, video, image, PDF) stored on the server. |
| **Playlist** | An ordered sequence of content items (used by carousel, media browser). |
| **App** | A template + config. Example: "APP 01 with these 3 audio files and this controller ID". |
| **Device** | A physical screen/laptop in the museum. Has a slug, gets assigned one app. |
| **Agent** | A daemon running on each museum laptop. Launches Chrome in kiosk mode, reports health. |
| **Template** | The display code that renders an app type (MonophoneAudioTemplate, MediaLoopTemplate, etc). |

---

## Admin Panel Pages

| Page | Purpose |
|------|---------|
| **Dashboard** | System health overview |
| **Apps** | Create/edit apps, assign templates and config |
| **Media** | Upload and manage content files |
| **Devices** | Register devices, assign apps, monitor status |
| **Playlists** | Build ordered content sequences |
| **Schedules** | Power on/off schedules for devices |
| **Groups** | Organize devices by zone/floor |
| **Exhibitions** | Multi-device exhibit coordination |
| **Floor Map** | Visual device positioning |
| **Users** | User management and roles |

---

## Documentation

Detailed docs are in the `docs/` folder:
- `docs/api/` — API endpoint reference
- `docs/admin/` — Admin panel usage
- `docs/display/` — Display client architecture
- `docs/devices/` — Device setup (Samsung, LG, Windows, etc.)
- `docs/agent/` — Agent daemon setup
- `docs/guide/` — Getting started guide
- `docs/server/` — Server configuration

---

## AV Code Reference

Every museum installation has an AV code (e.g., D-AV03, F-AV01, H-AV12a).

Format: `{Zone Letter}-AV{Number}{Variant}`
- **A** = Reception, **B** = Curato Experiences, **C** = Prologue
- **D** = Ambition, **E** = Factory, **F** = Consumer Care
- **G** = WIN, **H** = IT (Pre/Post 2000), **I** = Spirit of Curato
- **J** = Azim Premji Foundation, **K** = Community & Environment

Full catalog: **Curato-App-Catalog.md**
