import { useState } from 'react';
import { ChevronDown, ChevronRight, Server, Monitor, Database, Package, Copy, Check } from 'lucide-react';
function CopyBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-surface-900 text-surface-100 rounded-xl p-4 text-base overflow-x-auto whitespace-pre-wrap leading-relaxed">
        {code}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 h-7 w-7 flex items-center justify-center rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-300 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function Section({ title, icon: Icon, defaultOpen, children }: {
  title: string;
  icon: typeof Server;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="bryzos-card rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-surface-50 transition-colors"
      >
        <Icon className="h-5 w-5 text-brand-500 shrink-0" />
        <span className="text-[15px] font-semibold text-surface-800 flex-1">{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-surface-400" /> : <ChevronRight className="h-4 w-4 text-surface-400" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-base font-semibold text-surface-700 flex items-center gap-2">
        <span className="h-5 w-5 rounded-full bg-brand-500 text-white text-sm font-bold flex items-center justify-center shrink-0">{num}</span>
        {title}
      </h4>
      <div className="pl-7 space-y-2 text-base text-surface-600">{children}</div>
    </div>
  );
}

function Info({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-base text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300">
      {children}
    </div>
  );
}

export function InstallationGuidePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-surface-800">Installation Guide</h1>
        <p className="text-base text-surface-500 mt-1">Step-by-step setup instructions for server and slave devices</p>
      </div>

      {/* PART A: Server Setup */}
      <Section title="Part A: Server Setup" icon={Server}>
        <Info>Run these steps on the server PC (192.168.10.100). Open PowerShell as Administrator.</Info>

        <Step num={1} title="Start PostgreSQL Database (Docker)">
          <CopyBlock code={`docker run -d --name museumos-db \\
  -e POSTGRES_USER=postgres \\
  -e POSTGRES_PASSWORD=postgres123 \\
  -e POSTGRES_DB=museumos \\
  -p 5432:5432 \\
  --restart unless-stopped \\
  postgres:16-alpine`} />
          <p>Verify it's running:</p>
          <CopyBlock code={'docker ps --filter "name=museumos-db"'} />
        </Step>

        <Step num={2} title="Install Server Dependencies">
          <CopyBlock code={`cd C:\\Users\\Administrator\\Desktop\\museumos-app01\\server
npm install`} />
        </Step>

        <Step num={3} title="Configure Environment">
          <p>Make sure <code className="bg-surface-100 px-1.5 py-0.5 rounded text-sm">server\\.env</code> has:</p>
          <CopyBlock code="DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/museumos" />
        </Step>

        <Step num={4} title="Run Database Migrations">
          <CopyBlock code={`cd C:\\Users\\Administrator\\Desktop\\museumos-app01\\server
$env:DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/museumos"
npx knex migrate:latest --knexfile src/lib/knexfile.ts`} />
          <p>Expected output: <code className="bg-surface-100 px-1.5 py-0.5 rounded text-sm">Batch 1 run: 14 migrations</code></p>
        </Step>

        <Step num={5} title="Run Database Seeds">
          <CopyBlock code="npx knex seed:run --knexfile src/lib/knexfile.ts" />
          <Info>
            Default admin credentials:<br />
            Email: <strong>admin@museumos.local</strong><br />
            Password: <strong>admin123</strong>
          </Info>
        </Step>

        <Step num={6} title="Start the Server">
          <CopyBlock code={`cd C:\\Users\\Administrator\\Desktop\\museumos-app01\\server
npm run dev`} />
          <div className="space-y-1 text-base">
            <p>Server URLs:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>Admin panel: <strong>http://192.168.10.100:3401</strong></li>
              <li>API: <strong>http://192.168.10.100:3401/api</strong></li>
              <li>Health check: <strong>http://192.168.10.100:3401/api/health</strong></li>
            </ul>
          </div>
        </Step>
      </Section>

      {/* PART B: Slave Device Setup */}
      <Section title="Part B: Slave Device Setup" icon={Monitor} defaultOpen>
        <Info>Run these steps on EACH slave device, in order. Connect it to the museum LAN (the same 192.168.10.x network as the server at 192.168.10.100).</Info>

        <Step num={1} title="Configure BIOS (One Time)">
          <p>Restart the slave device and enter BIOS (F2 at boot).</p>
          <div className="bg-surface-50 rounded-xl p-4 space-y-5 text-base">
            <div>
              <p className="font-semibold text-surface-700">Connection page:</p>
              <ul className="list-disc pl-5 mt-1">
                <li>Integrated NIC: <strong>Enabled with PXE</strong></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-surface-700">System Management page:</p>
              <ul className="list-disc pl-5 mt-1">
                <li>Wake on LAN: <strong>LAN Only</strong></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-surface-700">Power page:</p>
              <ul className="list-disc pl-5 mt-1">
                <li>Deep Sleep Control: <strong>Disabled</strong></li>
                <li>AC Recovery: <strong>Power On</strong></li>
                <li>Block Sleep: <strong>OFF</strong></li>
              </ul>
            </div>
          </div>
          <p>Click <strong>Apply Changes</strong> and boot into Windows.</p>
        </Step>

        <Step num={2} title="Set a Static IP Address">
          <p>Give the device a fixed IP so the server can always reach it. Open <strong>Settings → Network &amp; Internet → Ethernet → IP assignment → Edit</strong>, choose <strong>Manual</strong>, turn on <strong>IPv4</strong>, and set:</p>
          <ul className="list-disc pl-5">
            <li>IP address: <strong>192.168.10.1xx</strong> — a unique address per device (e.g. 192.168.10.101)</li>
            <li>Subnet mask / prefix: <strong>255.255.255.0</strong> (/24)</li>
            <li>Gateway: <strong>192.168.10.1</strong></li>
            <li>Preferred DNS: <strong>192.168.10.1</strong> (or 8.8.8.8)</li>
          </ul>
          <p>Or, from an elevated PowerShell (replace the IP and the interface name if different):</p>
          <CopyBlock code={`netsh interface ip set address name="Ethernet" static 192.168.10.101 255.255.255.0 192.168.10.1`} />
        </Step>

        <Step num={3} title="Disable the Windows Firewall">
          <p>Open <strong>Windows Defender Firewall → Turn Windows Defender Firewall on or off</strong> and turn it <strong>Off</strong> for both Private and Public networks so the agent and display can be reached on the LAN.</p>
          <p>Or, from an elevated PowerShell:</p>
          <CopyBlock code="netsh advfirewall set allprofiles state off" />
        </Step>

        <Step num={4} title="Run the Setup Script (Elevated PowerShell)">
          <p>Open <strong>PowerShell as Administrator</strong> and run:</p>
          <CopyBlock code={`powershell -ep Bypass -c "irm 'http://192.168.10.100:3401/setup.ps1' | iex"`} />
          <p>This installs Node.js and Chrome, downloads the agent, installs it as a Windows service, and prompts for the device slug (e.g. <strong>a-av01</strong>).</p>
        </Step>

        <Step num={5} title="Run the Power Script (Elevated PowerShell)">
          <p>In the same <strong>elevated</strong> PowerShell, run:</p>
          <CopyBlock code={`powershell -ep bypass -c "irm 'http://192.168.10.100:3401/power.ps1' | iex"`} />
          <p>This configures the scheduled power on/off and Wake-on-LAN behaviour for the device.</p>
        </Step>

        <Step num={6} title="Pair the Device in the Admin Panel">
          <p>In this admin panel, open <strong>Devices</strong>, select the new device, and click <strong>Confirm Pairing</strong> on its detail page. Once paired, the device shows online and is ready to be assigned an app.</p>
        </Step>
      </Section>

      {/* PART C: Database Reference */}
      <Section title="Part C: Database Quick Reference" icon={Database}>
        <Step num={1} title="Start / Stop Database">
          <CopyBlock code={`docker start museumos-db       # Start DB
docker stop museumos-db        # Stop DB
docker ps --filter "name=museumos-db"  # Check status
docker logs museumos-db        # View DB logs`} />
        </Step>

        <Step num={2} title="Reset Database (keep container)">
          <CopyBlock code={`cd C:\\Users\\Administrator\\Desktop\\museumos-app01\\server
$env:DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/museumos"
npx knex migrate:rollback --all --knexfile src/lib/knexfile.ts
npx knex migrate:latest --knexfile src/lib/knexfile.ts
npx knex seed:run --knexfile src/lib/knexfile.ts`} />
        </Step>

        <Step num={3} title="Nuke Database (start completely fresh)">
          <CopyBlock code={`docker stop museumos-db
docker rm museumos-db
docker run -d --name museumos-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres123 -e POSTGRES_DB=museumos -p 5432:5432 --restart unless-stopped postgres:16-alpine
# Then run migrations and seeds again (Part A, Steps 4-5)`} />
        </Step>
      </Section>

      {/* PART D: Apps & Installations */}
      <Section title="Part D: Apps & Installations" icon={Package}>
        <div className="space-y-4">
          <div className="bg-surface-50 rounded-xl p-4 space-y-1">
            <h4 className="text-base font-semibold text-surface-700">1. Server (Backend API)</h4>
            <p className="text-sm text-surface-500">Node.js + Express + TypeScript + PostgreSQL | Port 3401</p>
            <CopyBlock code={`cd C:\\Users\\Administrator\\Desktop\\museumos-app01\\server
npm install
npm run dev          # Development (auto-reload)
npm run build        # Production build`} />
          </div>

          <div className="bg-surface-50 rounded-xl p-4 space-y-1">
            <h4 className="text-base font-semibold text-surface-700">2. Admin Panel (Web Dashboard)</h4>
            <p className="text-sm text-surface-500">React + Vite + TypeScript + TailwindCSS | Port 5173 (dev)</p>
            <CopyBlock code={`cd C:\\Users\\Administrator\\Desktop\\museumos-app01\\admin
npm install
npm run dev          # Development (http://localhost:5173)
npm run build        # Production build (output: admin/dist/)`} />
          </div>

          <div className="bg-surface-50 rounded-xl p-4 space-y-1">
            <h4 className="text-base font-semibold text-surface-700">3. Display App (Kiosk/Screen Frontend)</h4>
            <p className="text-sm text-surface-500">React + Vite + TypeScript | Port 5174 (dev)</p>
            <CopyBlock code={`cd C:\\Users\\Administrator\\Desktop\\museumos-app01\\display
npm install
npm run dev          # Development (http://localhost:5174)
npm run build        # Production build (output: display/dist/)`} />
          </div>

          <div className="bg-surface-50 rounded-xl p-4 space-y-1">
            <h4 className="text-base font-semibold text-surface-700">4. Agent (Runs on Slave Devices)</h4>
            <p className="text-sm text-surface-500">Node.js + TypeScript | Manages kiosk browser, power commands, health</p>
            <CopyBlock code={`cd C:\\Users\\Administrator\\Desktop\\museumos-app01\\agent
npm install
npx tsx src/index.ts          # Manual start
# Or use setup-device-local.ps1 to install as Windows service`} />
          </div>
        </div>

        <Step num={0} title="Install All at Once">
          <CopyBlock code={`cd C:\\Users\\Administrator\\Desktop\\museumos-app01
cd server && npm install && cd ..
cd admin && npm install && cd ..
cd display && npm install && cd ..
cd agent && npm install && cd ..`} />
        </Step>

        <Step num={0} title="Docker Build (Full Production Image)">
          <CopyBlock code={`cd C:\\Users\\Administrator\\Desktop\\museumos-app01
docker build -t museumos-app .
docker run -d --name museumos-server \\
  -p 3401:3401 \\
  -e DATABASE_URL="postgresql://postgres:postgres123@host.docker.internal:5432/museumos" \\
  -e JWT_SECRET="museumos-dev-secret-key-change-in-production-32chars" \\
  --restart unless-stopped \\
  museumos-app`} />
        </Step>
      </Section>
    </div>
  );
}
