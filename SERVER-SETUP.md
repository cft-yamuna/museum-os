# Museum OS Complete Setup Guide

---

## Part A: Server Setup (Run on the Server PC)

### Prerequisites

- Windows machine (Server IP: 192.168.0.253)
- Docker Desktop installed
- Node.js v20+ installed
- The `museumos-app01` folder on the machine

---

### Step 1: Start PostgreSQL Database (Docker)

Open PowerShell as Administrator:

```powershell
docker run -d --name museumos-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres123 -e POSTGRES_DB=museumos -p 5432:5432 --restart unless-stopped postgres:16-alpine
```

Verify it's running:

```powershell
docker ps --filter "name=museumos-db"
```

### Step 2: Install Server Dependencies

```powershell
cd C:\Users\Administrator\Desktop\museumos-app01\server
npm install
```

### Step 3: Configure Environment

Make sure `server\.env` has:

```
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/museumos
```

### Step 4: Run Database Migrations

```powershell
cd C:\Users\Administrator\Desktop\museumos-app01\server
$env:DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/museumos"
npx knex migrate:latest --knexfile src/lib/knexfile.ts
```

Expected output: `Batch 1 run: 14 migrations`

### Step 5: Run Database Seeds

```powershell
npx knex seed:run --knexfile src/lib/knexfile.ts
```

Default admin credentials:
- Email: `admin@museumos.local`
- Password: `admin123`

### Step 6: Start the Server

```powershell
cd C:\Users\Administrator\Desktop\museumos-app01\server
npm run dev
```

Server URLs:
- Admin panel: http://192.168.0.253:3401
- API: http://192.168.0.253:3401/api
- Health check: http://192.168.0.253:3401/api/health

---

## Part B: Slave Device Setup (Run on EACH Slave Device)

### Prerequisites

- Slave device connected to server via LAN cable (192.168.0.x subnet)
- The `museumos-app01` folder copied to the slave device
- PowerShell running as Administrator

---

### Step 1: Configure BIOS (One Time)

Restart the slave device and enter BIOS (F2 at boot).

**Connection page:**
- Integrated NIC: `Enabled with PXE`

**System Management page:**
- Wake on LAN: `LAN Only`

**Power page:**
- Deep Sleep Control: `Disabled`
- AC Recovery: `Power On`
- Block Sleep: `OFF`

Click **Apply Changes** and boot into Windows.

### Step 2: Run the WOL Configuration Script

Open PowerShell as Administrator on the slave device:

```powershell
cd C:\path\to\museumos-app01\agent
.\configure-wol.ps1
```

This script:
- Disables Fast Startup
- Disables Hibernate
- Enables Wake on Magic Packet on all adapters
- Disables Energy Efficient Ethernet (interferes with WOL)
- Enables Power Management wake settings
- Sets High Performance power plan

### Step 3: Run the Device Setup Script

```powershell
cd C:\path\to\museumos-app01\agent
.\setup-device-local.ps1 -DeviceSlug "kiosk-01"
```

Change the slug for each device: `kiosk-01`, `kiosk-02`, `kiosk-03`, etc.

This script:
- Installs Node.js (if missing)
- Installs agent dependencies
- Generates agent config pointing to server (192.168.0.253:3401)
- Installs NSSM Windows service (auto-starts on boot)
- Starts the agent service

### Step 4: Verify Connection

On the server terminal, you should see:

```
[AgentWS] Agent connected: <device-id> (kiosk-01)
```

### Step 5: Shut Down Properly (for WOL to work)

Always shut down slave devices with:

```powershell
shutdown /s /t 0
```

Never hold the power button or unplug — WOL won't work after that.

### Step 6: Test Wake-on-LAN

From the admin panel (http://192.168.0.253:3401):
1. Go to the device detail page
2. Click **Power On**
3. The server sends a WOL magic packet to the slave
4. The slave should turn on within a few seconds

---

## Part C: Database Quick Reference

### Start/Stop Database

```powershell
docker start museumos-db       # Start DB
docker stop museumos-db        # Stop DB
docker ps --filter "name=museumos-db"  # Check status
docker logs museumos-db        # View DB logs
```

### Reset Database (keep container)

```powershell
cd C:\Users\Administrator\Desktop\museumos-app01\server
$env:DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/museumos"
npx knex migrate:rollback --all --knexfile src/lib/knexfile.ts
npx knex migrate:latest --knexfile src/lib/knexfile.ts
npx knex seed:run --knexfile src/lib/knexfile.ts
```

### Nuke Database (start completely fresh)

```powershell
docker stop museumos-db
docker rm museumos-db
docker run -d --name museumos-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres123 -e POSTGRES_DB=museumos -p 5432:5432 --restart unless-stopped postgres:16-alpine
# Then run Step 4 and Step 5 from Part A
```

---

## Part D: Apps and Installations

The project has 4 main apps. Each needs its own `npm install`.

### 1. Server (Backend API)

```
Location: museumos-app01/server/
Tech:     Node.js + Express + TypeScript + PostgreSQL
Port:     3401
```

```powershell
cd C:\Users\Administrator\Desktop\museumos-app01\server
npm install
npm run dev          # Development (auto-reload)
npm run build        # Production build
```

### 2. Admin Panel (Web Dashboard)

```
Location: museumos-app01/admin/
Tech:     React + Vite + TypeScript + TailwindCSS
Port:     5173 (dev) / served by server in production
```

```powershell
cd C:\Users\Administrator\Desktop\museumos-app01\admin
npm install
npm run dev          # Development (http://localhost:5173)
npm run build        # Production build (output: admin/dist/)
```

### 3. Display App (Kiosk/Screen Frontend)

```
Location: museumos-app01/display/
Tech:     React + Vite + TypeScript
Port:     5174 (dev) / served by server in production
```

```powershell
cd C:\Users\Administrator\Desktop\museumos-app01\display
npm install
npm run dev          # Development (http://localhost:5174)
npm run build        # Production build (output: display/dist/)
```

### 4. Agent (Runs on Slave Devices)

```
Location: museumos-app01/agent/
Tech:     Node.js + TypeScript
Purpose:  Connects slave device to server, manages kiosk browser,
          handles power commands, reports health
```

```powershell
cd C:\Users\Administrator\Desktop\museumos-app01\agent
npm install
npx tsx src/index.ts          # Manual start
# Or use the setup script which installs it as a Windows service
```

### Install All at Once

```powershell
cd C:\Users\Administrator\Desktop\museumos-app01
cd server && npm install && cd ..
cd admin && npm install && cd ..
cd display && npm install && cd ..
cd agent && npm install && cd ..
```

### Build All for Production

```powershell
cd C:\Users\Administrator\Desktop\museumos-app01
cd server && npm run build && cd ..
cd admin && npm run build && cd ..
cd display && npm run build && cd ..
```

### Docker Build (Full Production Image)

```powershell
cd C:\Users\Administrator\Desktop\museumos-app01
docker build -t museumos-app .
docker run -d --name museumos-server -p 3401:3401 -e DATABASE_URL="postgresql://postgres:postgres123@host.docker.internal:5432/museumos" -e JWT_SECRET="museumos-dev-secret-key-change-in-production-32chars" --restart unless-stopped museumos-app
```

---

## Order of Operations (TL;DR)

### Server PC:
```
1. docker run ...              (start PostgreSQL)
2. cd server && npm install    (install deps)
3. check .env                  (verify DATABASE_URL)
4. knex migrate:latest         (create tables)
5. knex seed:run               (populate data)
6. npm run dev                 (start server)
```

### Each Slave Device:
```
1. BIOS: System Management > WOL = LAN Only, Power > Deep Sleep = Disabled, AC Recovery = Power On
2. .\configure-wol.ps1        (configure Windows WOL settings)
3. .\setup-device-local.ps1 -DeviceSlug "kiosk-XX"  (setup agent)
4. Verify connection in server logs
5. shutdown /s /t 0            (proper shutdown for WOL)
```
