import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createHash } from 'crypto';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { env } from './lib/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestTimeout } from './middleware/timeout.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import storageRoutes from './routes/storage.js';
import sitesRoutes from './routes/sites.js';
import floorsRoutes from './routes/floors.js';
import devicesRoutes from './routes/devices.js';
import groupsRoutes from './routes/groups.js';
import heartbeatRoutes from './routes/heartbeat.js';
import contentRoutes from './routes/content.js';
import contentVersionsRoutes from './routes/contentVersions.js';
import playlistsRoutes from './routes/playlists.js';
import exhibitionsRoutes from './routes/exhibitions.js';
import schedulesRoutes from './routes/schedules.js';
import alertsRoutes from './routes/alerts.js';
import auditLogsRoutes from './routes/auditLogs.js';
import lightingRoutes from './routes/lighting.js';
import appsRoutes from './routes/apps.js';
import screenshotsRoutes from './routes/screenshots.js';
import agentCommandsRoutes from './routes/agentCommands.js';
import deviceLogsRoutes from './routes/deviceLogs.js';
import agentUpdatesRoutes from './routes/agentUpdates.js';
import dbTransferRoutes from './routes/dbTransfer.js';
import receptionRoutes from './routes/reception.js';
import powerRoutes from './routes/power.js';
import analyticsRoutes from './routes/analytics.js';
import proofOfPlayRoutes from './routes/proofOfPlay.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getServedSetupScript(serverUrl: string, slug?: string): { script: string; scriptPath: string } {
  const scriptPath = path.resolve(__dirname, '../../agent/scripts/setup-windows.ps1');
  let script = readFileSync(scriptPath, 'utf-8');
  script = script.replace(/\$Server\s*=\s*'[^']*'/, () => `$Server = '${serverUrl}'`);
  if (slug) {
    script = script.replace(/\$Slug\s*=\s*''/, () => `$Slug = '${slug}'`);
  }
  return { script, scriptPath };
}

function getServedUninstallScript(): { script: string; scriptPath: string } {
  const scriptPath = path.resolve(__dirname, '../../agent/scripts/uninstall.ps1');
  const script = readFileSync(scriptPath, 'utf-8');
  return { script, scriptPath };
}

function getServedPowerScript(serverUrl: string): { script: string; scriptPath: string } {
  const scriptPath = path.resolve(__dirname, '../../agent/scripts/setup-device-power-only.ps1');
  let script = readFileSync(scriptPath, 'utf-8');
  script = script.replace(/__MUSEUMOS_SERVER_URL__/g, serverUrl);
  return { script, scriptPath };
}

function parseBooleanQuery(value: unknown, defaultValue: boolean): boolean {
  if (typeof value !== 'string') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function getSetupBootstrapScript(serverUrl: string, slug?: string): string {
  const slugQuery = slug ? `?slug=${encodeURIComponent(slug)}` : '';

  return `$ErrorActionPreference = 'Stop'
$Server = '${serverUrl}'
$Slug = '${slug ?? ''}'
$MainSetupUrl = '${serverUrl}/setup-main.ps1${slugQuery}'
$SshSetupUrl = '${serverUrl}/ssh.ps1'
$TempDir = Join-Path $env:TEMP ('museumos-bootstrap-' + [guid]::NewGuid().ToString('N'))
$MainSetupPath = Join-Path $TempDir 'setup-main.ps1'
$SshSetupPath = Join-Path $TempDir 'ssh.ps1'
$ServiceName = 'MuseumosAgent'
$SetupCompleteFile = 'C:\\Program Files\\Museumos\\Agent\\.museumos-setup-complete'

function Invoke-DownloadedScript {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Path,
        [int]$DownloadTimeoutSeconds = 30,
        [int]$ExecutionTimeoutSeconds = 7200
    )

    Write-Host ''
    Write-Host "[$Label] Downloading..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $Url -OutFile $Path -UseBasicParsing -TimeoutSec $DownloadTimeoutSeconds -ErrorAction Stop

    if (-not (Test-Path $Path) -or (Get-Item $Path).Length -lt 100) {
        throw "$Label returned an invalid script."
    }

    Write-Host "[$Label] Running..." -ForegroundColor Cyan
    $process = Start-Process powershell.exe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $Path) -NoNewWindow -PassThru

    if (-not $process.WaitForExit($ExecutionTimeoutSeconds * 1000)) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        throw "$Label timed out after $ExecutionTimeoutSeconds seconds."
    }

    $process.Refresh()
    $exitCode = if ($null -ne $process.ExitCode) { [int]$process.ExitCode } else { -1 }
    Write-Host "[$Label] Exit code: $exitCode" -ForegroundColor DarkGray
    return $exitCode
}

function Test-ServiceRunning {
    param([Parameter(Mandatory = $true)][string]$Name)

    $svc = Get-Service $Name -ErrorAction SilentlyContinue
    return ($svc -and $svc.Status -eq 'Running')
}

try {
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

    Write-Host '==============================================================' -ForegroundColor Cyan
    Write-Host ' Museum OS Setup Bootstrap' -ForegroundColor Cyan
    Write-Host '==============================================================' -ForegroundColor Cyan
    if ($Slug) {
        Write-Host "  Slug: $Slug" -ForegroundColor DarkGray
    } else {
        Write-Host '  Slug: prompt in main setup' -ForegroundColor DarkGray
    }

    $mainExitCode = Invoke-DownloadedScript -Label 'Main setup' -Url $MainSetupUrl -Path $MainSetupPath

    $agentRunning = Test-ServiceRunning -Name $ServiceName
    $sshRunning = Test-ServiceRunning -Name 'sshd'

    if (-not $sshRunning) {
        Write-Host ''
        Write-Host 'Main setup ended before SSH was ready; applying SSH fallback...' -ForegroundColor Yellow
        [void](Invoke-DownloadedScript -Label 'SSH fallback' -Url $SshSetupUrl -Path $SshSetupPath -ExecutionTimeoutSeconds 1200)
        $sshRunning = Test-ServiceRunning -Name 'sshd'
    }

    if (-not $agentRunning) {
        try {
            Start-Service $ServiceName -ErrorAction SilentlyContinue
        } catch {}
        $agentRunning = Test-ServiceRunning -Name $ServiceName
    }

    Write-Host ''
    Write-Host 'Bootstrap verification:' -ForegroundColor Cyan
    Write-Host "  Main setup exit : $mainExitCode" -ForegroundColor $(if ($mainExitCode -eq 0) { 'Green' } else { 'Yellow' })
    Write-Host "  Agent service   : $(if ($agentRunning) { 'RUNNING' } else { 'NOT RUNNING' })" -ForegroundColor $(if ($agentRunning) { 'Green' } else { 'Yellow' })
    Write-Host "  SSH service     : $(if ($sshRunning) { 'RUNNING' } else { 'NOT RUNNING' })" -ForegroundColor $(if ($sshRunning) { 'Green' } else { 'Red' })
    Write-Host "  Setup marker    : $(if (Test-Path $SetupCompleteFile) { 'PRESENT' } else { 'MISSING' })" -ForegroundColor $(if (Test-Path $SetupCompleteFile) { 'Green' } else { 'Yellow' })

    if (-not $sshRunning) {
        throw 'SSH is still not running after bootstrap fallback.'
    }
} finally {
    Remove-Item $MainSetupPath -Force -ErrorAction SilentlyContinue
    Remove-Item $SshSetupPath -Force -ErrorAction SilentlyContinue
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
`;
}

function getUninstallBootstrapScript(
  serverUrl: string,
  options?: {
    removeAllData?: boolean;
    removeOpenSsh?: boolean;
    resetPowerSettings?: boolean;
    resetNetworkSettings?: boolean;
    autoReboot?: boolean;
    removeKioskUser?: boolean;
    restoreComputerName?: string;
  },
): string {
  const parameterEntries = [
    `    RemoveAllData = $${(options?.removeAllData ?? true) ? 'true' : 'false'}`,
    `    RemoveOpenSsh = $${(options?.removeOpenSsh ?? true) ? 'true' : 'false'}`,
    `    ResetPowerSettings = $${(options?.resetPowerSettings ?? true) ? 'true' : 'false'}`,
    `    ResetNetworkSettings = $${(options?.resetNetworkSettings ?? true) ? 'true' : 'false'}`,
    `    AutoReboot = $${(options?.autoReboot ?? true) ? 'true' : 'false'}`,
  ];

  if (options?.removeKioskUser ?? true) {
    parameterEntries.push('    RemoveKioskUser = $true');
  }
  if (options?.restoreComputerName) {
    parameterEntries.push(`    RestoreComputerName = '${options.restoreComputerName.replace(/'/g, "''")}'`);
  }

  return `$ErrorActionPreference = 'Stop'
$UninstallUrl = '${serverUrl}/uninstall-main.ps1'
$TempDir = Join-Path $env:TEMP ('museumos-uninstall-' + [guid]::NewGuid().ToString('N'))
$UninstallPath = Join-Path $TempDir 'uninstall-main.ps1'
$Parameters = @{
${parameterEntries.join('\n')}
}

try {
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

    Write-Host '==============================================================' -ForegroundColor Cyan
    Write-Host ' Museum OS Uninstall / Reset' -ForegroundColor Cyan
    Write-Host '==============================================================' -ForegroundColor Cyan

    Write-Host '[Download] uninstall-main.ps1' -ForegroundColor Cyan
    Invoke-WebRequest -Uri $UninstallUrl -OutFile $UninstallPath -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop

    if (-not (Test-Path $UninstallPath) -or (Get-Item $UninstallPath).Length -lt 100) {
        throw 'uninstall-main.ps1 returned an invalid script.'
    }

    Write-Host '[Run] uninstall-main.ps1' -ForegroundColor Cyan
    & $UninstallPath @Parameters
    exit $LASTEXITCODE
} finally {
    Remove-Item $UninstallPath -Force -ErrorAction SilentlyContinue
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
`;
}

function getPowerBootstrapScript(
  serverUrl: string,
  options?: {
    slug?: string;
    installSsh?: boolean;
    enableAutoLogin?: boolean;
    disableSleep?: boolean;
    autoLoginUsername?: string;
  },
): string {
  const parameterEntries = [
    `    Server = '${serverUrl.replace(/'/g, "''")}'`,
    `    InstallSsh = $${(options?.installSsh ?? true) ? 'true' : 'false'}`,
    `    EnableAutoLogin = '${(options?.enableAutoLogin ?? true) ? 'true' : 'false'}'`,
    `    DisableSleep = '${(options?.disableSleep ?? true) ? 'true' : 'false'}'`,
  ];

  if (options?.slug) {
    parameterEntries.push(`    DeviceSlug = '${options.slug.replace(/'/g, "''")}'`);
  }
  if (options?.autoLoginUsername) {
    parameterEntries.push(`    AutoLoginUsername = '${options.autoLoginUsername.replace(/'/g, "''")}'`);
  }

  return `$ErrorActionPreference = 'Stop'
$PowerUrl = '${serverUrl}/power-main.ps1'
$TempDir = Join-Path $env:TEMP ('museumos-power-' + [guid]::NewGuid().ToString('N'))
$PowerPath = Join-Path $TempDir 'power-main.ps1'
$Parameters = @{
${parameterEntries.join('\n')}
}

try {
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

    Write-Host '==============================================================' -ForegroundColor Cyan
    Write-Host ' Museum OS Power-Only Setup' -ForegroundColor Cyan
    Write-Host '==============================================================' -ForegroundColor Cyan

    Write-Host '[Download] power-main.ps1' -ForegroundColor Cyan
    Invoke-WebRequest -Uri $PowerUrl -OutFile $PowerPath -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop

    if (-not (Test-Path $PowerPath) -or (Get-Item $PowerPath).Length -lt 100) {
        throw 'power-main.ps1 returned an invalid script.'
    }

    Write-Host '[Run] power-main.ps1' -ForegroundColor Cyan
    & $PowerPath @Parameters
    exit $LASTEXITCODE
} finally {
    Remove-Item $PowerPath -Force -ErrorAction SilentlyContinue
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
`;
}

function isDisplayAssetRequest(requestPath: string): boolean {
  return path.extname(requestPath) !== '';
}

export function createApp(): express.Application {
  const app = express();

  // --- Security ---
  app.use(helmet({
    hsts: false,
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    originAgentCluster: false,
  }));
  app.use(cors({
    origin: env.CORS_ORIGIN.split(',').map(o => o.trim()),
    credentials: true,
  }));

  // --- Rate Limiting ---
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests', code: 'RATE_LIMITED' },
  });
  app.use('/api/', apiLimiter);

  // --- Body Parsing ---
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // --- Request Logging ---
  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  // --- Request Timeouts ---
  app.use('/api/', requestTimeout(30 * 1000));        // 30s for API routes
  app.use('/storage/', requestTimeout(10 * 60 * 1000)); // 10min for uploads

  // --- Routes ---
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/storage', storageRoutes);

  app.use('/api/sites', sitesRoutes);
  app.use('/api/floors', floorsRoutes);
  app.use('/api/devices', devicesRoutes);
  app.use('/api/devices', heartbeatRoutes);
  app.use('/api/groups', groupsRoutes);
  app.use('/api/content', contentRoutes);
  app.use('/api/content', contentVersionsRoutes);
  app.use('/api/playlists', playlistsRoutes);
  app.use('/api/exhibitions', exhibitionsRoutes);
  app.use('/api/schedules', schedulesRoutes);
  app.use('/api/power', powerRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/proof-of-play', proofOfPlayRoutes);
  app.use('/api/alerts', alertsRoutes);
  app.use('/api/audit-logs', auditLogsRoutes);
  app.use('/api/lighting', lightingRoutes);
  app.use('/api/apps', appsRoutes);
  app.use('/api/devices', screenshotsRoutes);
  app.use('/api/devices', agentCommandsRoutes);
  app.use('/api/devices', deviceLogsRoutes);
  app.use(receptionRoutes);

  // --- Agent update management routes ---
  app.use('/api/agent', agentUpdatesRoutes);
  app.use('/api/db-transfer', dbTransferRoutes);

  // --- Serve pre-staged installers (Node.js, Chrome MSIs) for air-gapped setup ---
  // openssh.msi is served from storage/ (registered before static to take priority)
  app.get('/installers/openssh.msi', (_req: express.Request, res: express.Response) => {
    const opensshPath = path.resolve(__dirname, '../storage/openssh.msi');
    res.sendFile(opensshPath, (err) => {
      if (err) res.status(404).send('openssh.msi not found');
    });
  });
  app.use('/installers', express.static(path.resolve(__dirname, '../../server/installers'), {
    dotfiles: 'deny',
    index: false,
  }));

  // --- Agent setup script: one-liner install & update for Windows devices ---
  app.get('/setup.ps1', (req: express.Request, res: express.Response) => {
    const host = req.headers.host || req.hostname;
    const protocol = req.protocol;
    const serverUrl = `${protocol}://${host}`;
    const slug = req.query.slug as string | undefined;

    // Validate slug to prevent PowerShell injection (only alphanumeric + hyphens)
    if (slug && !/^[a-zA-Z0-9-]+$/.test(slug)) {
      res.status(400).send('# Invalid slug format. Use only letters, numbers, and hyphens.');
      return;
    }

    try {
      const script = getSetupBootstrapScript(serverUrl, slug);
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(script);
    } catch {
      res.status(404).send('# setup.ps1 not found');
    }
  });

  app.get('/setup-main.ps1', (req: express.Request, res: express.Response) => {
    const host = req.headers.host || req.hostname;
    const protocol = req.protocol;
    const serverUrl = `${protocol}://${host}`;
    const slug = req.query.slug as string | undefined;

    if (slug && !/^[a-zA-Z0-9-]+$/.test(slug)) {
      res.status(400).send('# Invalid slug format. Use only letters, numbers, and hyphens.');
      return;
    }

    try {
      const { script } = getServedSetupScript(serverUrl, slug);
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(script);
    } catch {
      res.status(404).send('# setup-main.ps1 not found');
    }
  });

  app.get('/setup-version', (req: express.Request, res: express.Response) => {
    const host = req.headers.host || req.hostname;
    const protocol = req.protocol;
    const serverUrl = `${protocol}://${host}`;
    const slug = req.query.slug as string | undefined;

    if (slug && !/^[a-zA-Z0-9-]+$/.test(slug)) {
      res.status(400).json({ error: 'Invalid slug format. Use only letters, numbers, and hyphens.' });
      return;
    }

    try {
      const { script, scriptPath } = getServedSetupScript(serverUrl, slug);
      const debugMarkerMatch = script.match(/\$SetupDebugMarker\s*=\s*'([^']+)'/);
      const hash = createHash('sha256').update(script, 'utf8').digest('hex');

      res.json({
        scriptPath,
        sha256: hash,
        setupDebugMarker: debugMarkerMatch?.[1] ?? null,
        hasPhase6: script.includes("[6/9] Kiosk hardening..."),
        hasPhase7: script.includes("[7/9] Installing SSH..."),
        hasLegacySshFallback: script.includes('Legacy ssh.ps1 installer'),
      });
    } catch (error) {
      res.status(404).json({
        error: 'setup.ps1 not found',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/power.ps1', (req: express.Request, res: express.Response) => {
    const host = req.headers.host || req.hostname;
    const protocol = req.protocol;
    const serverUrl = `${protocol}://${host}`;
    const slug = req.query.slug as string | undefined;

    if (slug && !/^[a-zA-Z0-9-]+$/.test(slug)) {
      res.status(400).send('# Invalid slug format. Use only letters, numbers, and hyphens.');
      return;
    }

    try {
      const script = getPowerBootstrapScript(serverUrl, {
        slug,
        installSsh: parseBooleanQuery(req.query.installSsh, true),
        enableAutoLogin: parseBooleanQuery(req.query.autoLogin, true),
        disableSleep: parseBooleanQuery(req.query.disableSleep, true),
        autoLoginUsername: typeof req.query.autoLoginUsername === 'string' ? req.query.autoLoginUsername : undefined,
      });
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(script);
    } catch {
      res.status(404).send('# power.ps1 not found');
    }
  });

  app.get('/power-main.ps1', (req: express.Request, res: express.Response) => {
    const host = req.headers.host || req.hostname;
    const protocol = req.protocol;
    const serverUrl = `${protocol}://${host}`;

    try {
      const { script } = getServedPowerScript(serverUrl);
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(script);
    } catch {
      res.status(404).send('# power-main.ps1 not found');
    }
  });

  app.get('/setup-device-power-only.ps1', (req: express.Request, res: express.Response) => {
    const queryIndex = req.originalUrl.indexOf('?');
    const queryString = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    res.redirect(307, `/power.ps1${queryString}`);
  });

  app.get('/uninstall.ps1', (req: express.Request, res: express.Response) => {
    const host = req.headers.host || req.hostname;
    const protocol = req.protocol;
    const serverUrl = `${protocol}://${host}`;
    const restoreComputerName = typeof req.query.restoreComputerName === 'string'
      ? req.query.restoreComputerName.trim()
      : '';

    if (restoreComputerName && !/^[a-zA-Z0-9-]{1,15}$/.test(restoreComputerName)) {
      res.status(400).send('# Invalid restoreComputerName. Use 1-15 letters, numbers, or hyphens.');
      return;
    }

    try {
      const script = getUninstallBootstrapScript(serverUrl, {
        removeAllData: parseBooleanQuery(req.query.removeAllData, true),
        removeOpenSsh: parseBooleanQuery(req.query.removeOpenSsh, true),
        resetPowerSettings: parseBooleanQuery(req.query.resetPowerSettings, true),
        resetNetworkSettings: parseBooleanQuery(req.query.resetNetworkSettings, true),
        autoReboot: parseBooleanQuery(req.query.autoReboot, true),
        removeKioskUser: parseBooleanQuery(req.query.removeKioskUser, true),
        restoreComputerName: restoreComputerName || undefined,
      });
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(script);
    } catch {
      res.status(404).send('# uninstall.ps1 not found');
    }
  });

  app.get('/uninstall-main.ps1', (_req: express.Request, res: express.Response) => {
    try {
      const { script } = getServedUninstallScript();
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(script);
    } catch {
      res.status(404).send('# uninstall-main.ps1 not found');
    }
  });

  app.get('/uninstall-windows.ps1', (req: express.Request, res: express.Response) => {
    const queryIndex = req.originalUrl.indexOf('?');
    const queryString = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    res.redirect(307, `/uninstall.ps1${queryString}`);
  });

  // --- SSH install script for Windows kiosk devices ---
  app.get('/ssh.ps1', (req: express.Request, res: express.Response) => {
    const host = req.headers.host || req.hostname;
    const protocol = req.protocol;
    const serverUrl = `${protocol}://${host}`;
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(`$Server = '${serverUrl}'
$ErrorActionPreference = 'Continue'
$KioskUsername = 'kiosk'
$KioskPassword = 'Light123'

function Ensure-KioskUser {
    $existing = Get-LocalUser -Name $KioskUsername -ErrorAction SilentlyContinue
    if (-not $existing) {
        net user $KioskUsername $KioskPassword /add 2>$null | Out-Null
    } else {
        net user $KioskUsername $KioskPassword 2>$null | Out-Null
    }
    net user $KioskUsername /expires:never 2>$null | Out-Null
    try { Set-LocalUser -Name $KioskUsername -PasswordNeverExpires $true -ErrorAction SilentlyContinue } catch {}
    net localgroup Administrators $KioskUsername /add 2>$null | Out-Null

    $winlogon = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
    Set-ItemProperty -Path $winlogon -Name 'AutoAdminLogon' -Value '1'
    Set-ItemProperty -Path $winlogon -Name 'DefaultUserName' -Value $KioskUsername
    Set-ItemProperty -Path $winlogon -Name 'DefaultDomainName' -Value $env:COMPUTERNAME
    Set-ItemProperty -Path $winlogon -Name 'DefaultPassword' -Value $KioskPassword
}

function Set-SshDefaultShell {
    $openSshReg = 'HKLM:\\SOFTWARE\\OpenSSH'
    if (-not (Test-Path $openSshReg)) { New-Item -Path $openSshReg -Force | Out-Null }
    $powerShellPath = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    Set-ItemProperty -Path $openSshReg -Name 'DefaultShell' -Value $powerShellPath -ErrorAction SilentlyContinue
}

function Ensure-SshFirewallRule {
    $rule = Get-NetFirewallRule -DisplayName 'OpenSSH' -ErrorAction SilentlyContinue
    if (-not $rule) {
        New-NetFirewallRule -DisplayName 'OpenSSH' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 22 | Out-Null
    }
}

function Grant-SshPathAccess {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path $Path)) { return $false }

    try {
        $item = Get-Item -LiteralPath $Path -ErrorAction Stop
        if ($item.PSIsContainer) {
            & takeown.exe /F $item.FullName /A /R /D Y 2>$null | Out-Null
            & icacls.exe $item.FullName /inheritance:r /grant '*S-1-5-18:(OI)(CI)F' /grant '*S-1-5-32-544:(OI)(CI)F' 2>$null | Out-Null
        } else {
            try { attrib -R $item.FullName 2>$null | Out-Null } catch {}
            & takeown.exe /F $item.FullName /A 2>$null | Out-Null
            & icacls.exe $item.FullName /inheritance:r /grant '*S-1-5-18:F' /grant '*S-1-5-32-544:F' 2>$null | Out-Null
        }
        return $true
    } catch {
        return $false
    }
}

function Ensure-SshConfigWritable {
    $programDataSsh = 'C:\\ProgramData\\ssh'
    if (-not (Test-Path $programDataSsh)) { New-Item -ItemType Directory -Force -Path $programDataSsh | Out-Null }

    $logsDir = Join-Path $programDataSsh 'logs'
    if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Force -Path $logsDir | Out-Null }

    [void](Grant-SshPathAccess -Path $programDataSsh)
    [void](Grant-SshPathAccess -Path $logsDir)
    [void](Grant-SshPathAccess -Path (Join-Path $programDataSsh 'sshd_config'))
    [void](Grant-SshPathAccess -Path (Join-Path $programDataSsh 'administrators_authorized_keys'))

    return $true
}

function Set-SshdGlobalOption {
    param(
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][string]$Value
    )
    $configPath = 'C:\\ProgramData\\ssh\\sshd_config'
    if (-not (Test-Path $configPath)) { return }
    [void](Ensure-SshConfigWritable)
    $lines = @(Get-Content $configPath -ErrorAction SilentlyContinue)
    $pattern = '^\\s*#?\\s*' + [regex]::Escape($Key) + '\\s+'
    $updated = $false
    $next = New-Object System.Collections.Generic.List[string]
    foreach ($line in $lines) {
        if ($line -match $pattern) {
            if (-not $updated) {
                $next.Add("$Key $Value")
                $updated = $true
            }
            continue
        }
        if (-not $updated -and $line -match '^\\s*Match\\s+') {
            $next.Add("$Key $Value")
            $updated = $true
        }
        $next.Add($line)
    }
    if (-not $updated) { $next.Add("$Key $Value") }
    [void](Ensure-SshConfigWritable)
    Set-Content -Path $configPath -Value $next -Encoding ASCII
}

function Ensure-SshPasswordAuth {
    Set-SshdGlobalOption -Key 'PasswordAuthentication' -Value 'yes'
    Set-SshdGlobalOption -Key 'PubkeyAuthentication' -Value 'yes'
}

function Get-SshBinaryDirectory {
    $candidates = @(
        (Join-Path $env:SystemRoot 'System32\\OpenSSH'),
        'C:\\Program Files\\OpenSSH-Win64'
    )
    foreach ($candidate in $candidates) {
        if (Test-Path (Join-Path $candidate 'sshd.exe')) {
            return $candidate
        }
    }
    return $null
}

function Ensure-SshConfigAndKeys {
    $sshDir = Get-SshBinaryDirectory
    if (-not $sshDir) { return $false }

    $programDataSsh = 'C:\\ProgramData\\ssh'
    $configPath = Join-Path $programDataSsh 'sshd_config'
    $defaultConfigPath = Join-Path $sshDir 'sshd_config_default'
    $sshKeygen = Join-Path $sshDir 'ssh-keygen.exe'

    if (-not (Test-Path $programDataSsh)) { New-Item -ItemType Directory -Force -Path $programDataSsh | Out-Null }
    if (-not (Test-Path $configPath) -and (Test-Path $defaultConfigPath)) {
        Copy-Item $defaultConfigPath $configPath -Force
    }
    if (Test-Path $sshKeygen) {
        & $sshKeygen -A 2>&1 | Out-Null
    }
    [void](Ensure-SshConfigWritable)
    return (Test-Path $configPath)
}

function Repair-SshFilePermissions {
    $sshDir = Get-SshBinaryDirectory
    if (-not $sshDir) { return $false }

    $hostFixScript = Join-Path $sshDir 'FixHostFilePermissions.ps1'
    if (Test-Path $hostFixScript) {
        try {
            & $hostFixScript -Confirm:$false 2>&1 | Out-Null
        } catch {
            Write-Host "  Host key permission repair failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
        }
    }

    $programDataSsh = 'C:\\ProgramData\\ssh'
    if (-not (Test-Path $programDataSsh)) { return $false }

    try {
        [void](Grant-SshPathAccess -Path $programDataSsh)
        [void](Grant-SshPathAccess -Path (Join-Path $programDataSsh 'sshd_config'))
        [void](Grant-SshPathAccess -Path (Join-Path $programDataSsh 'administrators_authorized_keys'))
        Get-ChildItem $programDataSsh -Filter 'ssh_host_*_key*' -ErrorAction SilentlyContinue | ForEach-Object {
            [void](Grant-SshPathAccess -Path $_.FullName)
        }
        return $true
    } catch {
        Write-Host "  Manual SSH permission repair failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
        return $false
    }
}

function Ensure-SshServiceRegistration {
    $sshd = Get-Service sshd -ErrorAction SilentlyContinue
    if ($sshd) { return $true }

    $sshDir = Get-SshBinaryDirectory
    if (-not $sshDir) { return $false }

    $sshdExe = Join-Path $sshDir 'sshd.exe'
    if (-not (Test-Path $sshdExe)) { return $false }

    $serviceBinary = '"' + $sshdExe + '"'
    New-Service -Name sshd -BinaryPathName $serviceBinary -DisplayName 'OpenSSH SSH Server' -StartupType Automatic -ErrorAction SilentlyContinue | Out-Null
    [void](Set-SshServiceImagePath -SshdExePath $sshdExe)
    return [bool](Get-Service sshd -ErrorAction SilentlyContinue)
}

function Set-SshServiceImagePath {
    param([Parameter(Mandatory = $true)][string]$SshdExePath)

    $serviceRegPath = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\sshd'
    if (-not (Test-Path $serviceRegPath)) { return $false }

    $serviceBinary = '"' + $SshdExePath + '"'
    try {
        New-ItemProperty -Path $serviceRegPath -Name 'ImagePath' -PropertyType ExpandString -Value $serviceBinary -Force | Out-Null
        return $true
    } catch {
        try {
            Set-ItemProperty -Path $serviceRegPath -Name 'ImagePath' -Value $serviceBinary -ErrorAction Stop
            return $true
        } catch {
            Write-Host "  Failed to set sshd ImagePath: $($_.Exception.Message)" -ForegroundColor DarkYellow
            return $false
        }
    }
}

function Ensure-SshServiceConfiguration {
    $sshDir = Get-SshBinaryDirectory
    if (-not $sshDir) { return $false }

    $sshdExe = Join-Path $sshDir 'sshd.exe'
    if (-not (Test-Path $sshdExe)) { return $false }

    [void](Set-SshServiceImagePath -SshdExePath $sshdExe)
    try { & sc.exe config sshd start= auto 2>&1 | Out-Null } catch {}
    try {
        & sc.exe privs sshd SeAssignPrimaryTokenPrivilege/SeTcbPrivilege/SeBackupPrivilege/SeRestorePrivilege/SeImpersonatePrivilege 2>&1 | Out-Null
    } catch {}

    return $true
}

function Write-SshDiagnostics {
    Write-Host '  sshd diagnostics:' -ForegroundColor DarkYellow

    $sshDir = Get-SshBinaryDirectory
    if ($sshDir) {
        $sshdExe = Join-Path $sshDir 'sshd.exe'
        if (Test-Path $sshdExe) {
            try {
                $configTest = & $sshdExe -t 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Host '    config test: OK' -ForegroundColor DarkGray
                } else {
                    Write-Host "    config test failed: $($configTest -join ' ')" -ForegroundColor DarkYellow
                }
            } catch {
                Write-Host "    config test exception: $($_.Exception.Message)" -ForegroundColor DarkYellow
            }
        }
    }

    try {
        $svcDetails = Get-CimInstance Win32_Service -Filter "Name='sshd'" -ErrorAction SilentlyContinue
        if ($svcDetails) {
            Write-Host "    service state: $($svcDetails.State)" -ForegroundColor DarkGray
            Write-Host "    start mode: $($svcDetails.StartMode)" -ForegroundColor DarkGray
            Write-Host "    start name: $($svcDetails.StartName)" -ForegroundColor DarkGray
            Write-Host "    path: $($svcDetails.PathName)" -ForegroundColor DarkGray
            Write-Host "    exit code: $($svcDetails.ExitCode)" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "    service detail read failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }

    try {
        $imagePath = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\sshd' -Name 'ImagePath' -ErrorAction SilentlyContinue).ImagePath
        if ($imagePath) {
            Write-Host "    image path: $imagePath" -ForegroundColor DarkGray
            $imagePathNormalized = $imagePath.Trim('"')
            Write-Host "    image exists: $(Test-Path $imagePathNormalized)" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "    image path read failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }

    try {
        $systemEvents = Get-WinEvent -LogName System -MaxEvents 80 -ErrorAction SilentlyContinue |
            Where-Object { $_.ProviderName -eq 'Service Control Manager' -and $_.Message -match 'OpenSSH SSH Server|sshd' } |
            Select-Object -First 3
        foreach ($event in $systemEvents) {
            Write-Host "    system event: $($event.Message -replace '\\r?\\n', ' ')" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "    system event read failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }

    try {
        $events = Get-WinEvent -LogName 'OpenSSH/Operational' -MaxEvents 50 -ErrorAction SilentlyContinue |
            Select-Object -First 5
        foreach ($event in $events) {
            Write-Host "    openssh event: $($event.Message -replace '\\r?\\n', ' ')" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "    OpenSSH event read failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
}

function Repair-SshdService {
    Write-Host '  Repairing sshd service...' -ForegroundColor Yellow

    [void](Ensure-SshConfigAndKeys)
    [void](Repair-SshFilePermissions)
    [void](Ensure-SshServiceRegistration)
    [void](Ensure-SshServiceConfiguration)

    $sshd = Get-Service sshd -ErrorAction SilentlyContinue
    if (-not $sshd) {
        Write-Host '  sshd service is still missing after repair attempt.' -ForegroundColor Yellow
        return $false
    }

    Set-Service sshd -StartupType Automatic -ErrorAction SilentlyContinue
    try { Restart-Service sshd -Force -ErrorAction SilentlyContinue } catch {}
    try { Start-Service sshd -ErrorAction SilentlyContinue } catch {}
    Start-Sleep -Seconds 3

    $sshd = Get-Service sshd -ErrorAction SilentlyContinue
    if ($sshd -and $sshd.Status -eq 'Running') {
        Write-Host '  sshd repair succeeded.' -ForegroundColor Green
        return $true
    }

    Write-SshDiagnostics
    return $false
}

function Invoke-OpenSshInstallStep {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string]$Command,
        [int]$TimeoutSeconds = 90
    )
    Write-Host "  $Label (max $($TimeoutSeconds)s)..." -ForegroundColor DarkGray
    try {
        $process = Start-Process powershell.exe -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $Command) -WindowStyle Hidden -PassThru
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            Write-Host "  $Label timed out." -ForegroundColor Yellow
            return $false
        }
        return $process.ExitCode -eq 0
    } catch {
        Write-Host "  $Label failed: $($_.Exception.Message)" -ForegroundColor DarkYellow
        return $false
    }
}

function Ensure-SshdAdminKeyConfig {
    $configPath = 'C:\\ProgramData\\ssh\\sshd_config'
    if (-not (Test-Path $configPath)) { return }
    [void](Ensure-SshConfigWritable)
    $raw = Get-Content $configPath -Raw -ErrorAction SilentlyContinue
    if ($raw -notmatch 'administrators_authorized_keys') {
        Add-Content -Path $configPath -Value ''
        Add-Content -Path $configPath -Value 'Match Group administrators'
        Add-Content -Path $configPath -Value '       AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys'
    }
}

function Install-ServerAuthorizedKeys {
    $tmpKeys = Join-Path $env:TEMP 'museumos-authorized_keys'
    $destDir = 'C:\\ProgramData\\ssh'
    $destKeys = Join-Path $destDir 'administrators_authorized_keys'
    Remove-Item $tmpKeys -Force -ErrorAction SilentlyContinue
    try {
        Invoke-WebRequest "$Server/installers/authorized_keys" -OutFile $tmpKeys -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    } catch {
        return $false
    }
    if (-not (Test-Path $tmpKeys) -or (Get-Item $tmpKeys).Length -lt 20) {
        Remove-Item $tmpKeys -Force -ErrorAction SilentlyContinue
        return $false
    }
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item $tmpKeys $destKeys -Force
    Remove-Item $tmpKeys -Force -ErrorAction SilentlyContinue
    [void](Ensure-SshConfigWritable)
    & icacls $destKeys /inheritance:r /grant '*S-1-5-32-544:F' /grant '*S-1-5-18:F' 2>$null | Out-Null
    Ensure-SshdAdminKeyConfig
    return $true
}

function Install-OpenSshFromZip {
    param([Parameter(Mandatory = $true)][string]$ServerUrl)

    Write-Host '  Installing OpenSSH from bundled ZIP...' -ForegroundColor Yellow

    $zipPath = Join-Path $env:TEMP 'OpenSSH-Win64.zip'
    $extractRoot = Join-Path $env:TEMP ('OpenSSH-Win64-' + [guid]::NewGuid().ToString('N'))
    $targetDir = 'C:\\Program Files\\OpenSSH-Win64'
    $localZip = 'C:\\Program Files\\Museumos\\Agent\\scripts\\OpenSSH-Win64.zip'

    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue

    try {
        if (Test-Path $localZip) {
            Copy-Item $localZip $zipPath -Force
        } else {
            try {
                Invoke-WebRequest "$ServerUrl/openssh.zip" -OutFile $zipPath -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop
            } catch {
                Invoke-WebRequest "$ServerUrl/installers/openssh.zip" -OutFile $zipPath -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop
            }
        }

        if (-not (Test-Path $zipPath) -or (Get-Item $zipPath).Length -lt 1000000) {
            Write-Host '  OpenSSH ZIP missing or too small.' -ForegroundColor Yellow
            return $false
        }

        Expand-Archive -Path $zipPath -DestinationPath $extractRoot -Force
        $sshdExe = Get-ChildItem $extractRoot -Recurse -Filter 'sshd.exe' | Select-Object -First 1
        if (-not $sshdExe) {
            Write-Host '  OpenSSH ZIP did not contain sshd.exe.' -ForegroundColor Yellow
            return $false
        }

        $sourceDir = $sshdExe.Directory.FullName
        $installScript = Join-Path $sourceDir 'install-sshd.ps1'
        if (-not (Test-Path $installScript)) {
            Write-Host '  OpenSSH ZIP did not contain install-sshd.ps1.' -ForegroundColor Yellow
            return $false
        }

        $ErrorActionPreference = 'Continue'
        Stop-Service sshd -Force -ErrorAction SilentlyContinue
        Stop-Service ssh-agent -Force -ErrorAction SilentlyContinue
        $ErrorActionPreference = 'Stop'

        if (Test-Path $targetDir) {
            Remove-Item $targetDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $targetDir) | Out-Null
        Copy-Item $sourceDir $targetDir -Recurse -Force

        Get-ChildItem $targetDir -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

        Push-Location $targetDir
        try {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installScript
            $installExitCode = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } else { 0 }
            if ($installExitCode -ne 0) {
                Write-Host "  install-sshd.ps1 exited with code $installExitCode." -ForegroundColor Yellow
            }
        } finally {
            Pop-Location
        }

        $sshInstalled = Get-Service sshd -ErrorAction SilentlyContinue
        if (-not $sshInstalled) {
            Write-Host '  install-sshd.ps1 did not create sshd service; creating manually.' -ForegroundColor Yellow
            $serviceBinary = '"' + (Join-Path $targetDir 'sshd.exe') + '"'
            New-Service -Name sshd -BinaryPathName $serviceBinary -DisplayName 'OpenSSH SSH Server' -StartupType Automatic -ErrorAction SilentlyContinue | Out-Null
            [void](Set-SshServiceImagePath -SshdExePath (Join-Path $targetDir 'sshd.exe'))
            try {
                & sc.exe privs sshd SeAssignPrimaryTokenPrivilege/SeTcbPrivilege/SeBackupPrivilege/SeRestorePrivilege/SeImpersonatePrivilege 2>&1 | Out-Null
            } catch {}
            $sshInstalled = Get-Service sshd -ErrorAction SilentlyContinue
        }

        return [bool]$sshInstalled
    } catch {
        Write-Host "  OpenSSH ZIP install failed: $($_.Exception.Message)" -ForegroundColor Yellow
        return $false
    } finally {
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        Remove-Item $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Ensure-KioskUser
Write-Host 'Installing OpenSSH...' -ForegroundColor Yellow
$sshd = Get-Service sshd -ErrorAction SilentlyContinue
if ($sshd) {
    Write-Host '  Already installed' -ForegroundColor Green
} else {
    [void](Invoke-OpenSshInstallStep -Label 'Windows OpenSSH capability install' -Command "Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' -ErrorAction SilentlyContinue | Out-Null" -TimeoutSeconds 90)
    $sshd = Get-Service sshd -ErrorAction SilentlyContinue
    if (-not $sshd) {
        [void](Invoke-OpenSshInstallStep -Label 'DISM OpenSSH fallback' -Command "dism /online /Add-Capability /CapabilityName:OpenSSH.Server~~~~0.0.1.0 /NoRestart | Out-Null" -TimeoutSeconds 90)
        $sshd = Get-Service sshd -ErrorAction SilentlyContinue
    }
    if (-not $sshd) {
        [void](Install-OpenSshFromZip -ServerUrl $Server)
    }
}

$sshd = Get-Service sshd -ErrorAction SilentlyContinue
if (-not $sshd) {
    Write-Host 'SSH FAILED - OpenSSH Server could not be installed' -ForegroundColor Red
    Write-Host 'Fix Windows Optional Features or stage /server/installers/openssh.msi, then run again.' -ForegroundColor Yellow
    exit 1
}

Set-Service sshd -StartupType Automatic -ErrorAction SilentlyContinue
Set-SshDefaultShell
Ensure-SshFirewallRule
Ensure-SshPasswordAuth
$keysInstalled = Install-ServerAuthorizedKeys
Restart-Service sshd -Force -ErrorAction SilentlyContinue
Start-Service sshd -ErrorAction SilentlyContinue
Write-Host ''
$s = Get-Service sshd -ErrorAction SilentlyContinue
if (-not ($s -and $s.Status -eq 'Running')) {
    if (Repair-SshdService) {
        $s = Get-Service sshd -ErrorAction SilentlyContinue
    }
}
if (-not ($s -and $s.Status -eq 'Running')) {
    Write-Host '  sshd still not running; reinstalling from bundled ZIP...' -ForegroundColor Yellow
    if (Install-OpenSshFromZip -ServerUrl $Server) {
        Set-Service sshd -StartupType Automatic -ErrorAction SilentlyContinue
        Set-SshDefaultShell
        Ensure-SshFirewallRule
        Ensure-SshPasswordAuth
        try { Restart-Service sshd -Force -ErrorAction SilentlyContinue } catch {}
        try { Start-Service sshd -ErrorAction SilentlyContinue } catch {}
        Start-Sleep -Seconds 2
        if (Repair-SshdService) {
            $s = Get-Service sshd -ErrorAction SilentlyContinue
        }
    }
}
if ($s -and $s.Status -eq 'Running') {
    Write-Host 'SSH READY' -ForegroundColor Green
    Write-Host "  User: $KioskUsername" -ForegroundColor Cyan
    Write-Host "  Password: $KioskPassword" -ForegroundColor Cyan
    Write-Host '  Auto-login: enabled' -ForegroundColor Cyan
    if ($keysInstalled) {
        Write-Host '  authorized_keys installed from server' -ForegroundColor Green
    } else {
        Write-Host '  No server authorized_keys found; SSH will use normal Windows auth' -ForegroundColor DarkYellow
    }
} else {
    Write-Host 'SSH FAILED - service not running after repair' -ForegroundColor Red
    exit 1
}
`);
  });

  // --- Fix agent config: set shellMode=true, auto-login, restart service ---
  app.get('/fix.ps1', (_req: express.Request, res: express.Response) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(`$p = "C:\\Program Files\\Museumos\\Agent\\agent.config.json"
$c = Get-Content $p -Raw | ConvertFrom-Json
$c.kiosk | Add-Member -NotePropertyName shellMode -NotePropertyValue $true -Force
$json = $c | ConvertTo-Json -Depth 5
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($p, $json, $utf8NoBom)
Write-Host "shellMode set to: $($c.kiosk.shellMode)" -ForegroundColor Green
# Fix auto-login: use local kiosk login with SSH password
$KioskUsername = 'kiosk'
$KioskPassword = 'Light123'
$winlogon = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'
$existing = Get-LocalUser -Name $KioskUsername -ErrorAction SilentlyContinue
if (-not $existing) {
    net user $KioskUsername $KioskPassword /add 2>$null | Out-Null
} else {
    net user $KioskUsername $KioskPassword 2>$null | Out-Null
}
net user $KioskUsername /expires:never 2>$null | Out-Null
try { Set-LocalUser -Name $KioskUsername -PasswordNeverExpires $true -ErrorAction SilentlyContinue } catch {}
net localgroup Administrators $KioskUsername /add 2>$null | Out-Null
Set-ItemProperty -Path $winlogon -Name 'AutoAdminLogon' -Value '1'
Set-ItemProperty -Path $winlogon -Name 'DefaultUserName' -Value $KioskUsername
Set-ItemProperty -Path $winlogon -Name 'DefaultDomainName' -Value $env:COMPUTERNAME
Set-ItemProperty -Path $winlogon -Name 'DefaultPassword' -Value $KioskPassword
Write-Host "Auto-login configured for $KioskUsername" -ForegroundColor Green
taskkill /im chrome.exe /f 2>$null | Out-Null
net stop MuseumosAgent 2>$null | Out-Null
net start MuseumosAgent
`);
  });

  // --- Serve OpenSSH zip for offline install ---
  app.get('/openssh.zip', (_req: express.Request, res: express.Response) => {
    const zipPath = path.resolve(__dirname, '../../agent/scripts/OpenSSH-Win64.zip');
    try {
      res.sendFile(zipPath);
    } catch {
      res.status(404).send('OpenSSH zip not found');
    }
  });

  // --- Bandwidth test endpoint for agent network diagnostics ---
  app.get('/api/agent/bandwidth-test', (_req, res) => {
    res.set('Content-Type', 'application/octet-stream');
    res.send(Buffer.alloc(1024 * 1024));
  });

  // --- Short device URL redirect: /d/:slug → display app with deviceId + apiKey ---
  app.get('/d/:slug', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const { getDb } = await import('./lib/db.js');
      const db = getDb();
      const slug = String(req.params.slug);
      const device = await db('devices').where('slug', slug).first();
      if (!device) {
        res.status(404).json({ error: 'Device not found' });
        return;
      }
      const apiKey = device.config?.apiKey || '';
      res.redirect(`/display/${slug}?deviceId=${device.id}&apiKey=${apiKey}`);
    } catch (err) {
      next(err);
    }
  });

  // --- Serve documentation site (VitePress) ---
  const docsDist = path.resolve(__dirname, '../../docs/.vitepress/dist');
  app.use('/docs', express.static(docsDist));
  app.get('/docs/*', (_req: express.Request, res: express.Response) => {
    res.sendFile(path.join(docsDist, 'index.html'));
  });

  // --- Serve demo-media static files ---
  const demoMediaPath = path.resolve(__dirname, '../../demo-media');
  app.use('/demo-media', express.static(demoMediaPath));

  // --- Serve display template assets directly (works in dev without display build) ---
  const displayTemplatesPath = path.resolve(__dirname, '../../display/public/templates');
  app.use('/display/templates', express.static(displayTemplatesPath));

  // --- Serve display SPA static files (production) ---
  const displayDist = path.resolve(__dirname, '../../display/dist');
  app.use('/display', express.static(displayDist));
  app.get('/display/*', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (isDisplayAssetRequest(req.path)) {
      return next();
    }
    res.sendFile(path.join(displayDist, 'index.html'));
  });

  // --- Serve admin UI static files (production) ---
  const adminDist = path.resolve(__dirname, '../../admin/dist');
  app.use(express.static(adminDist));

  // SPA fallback — serve index.html for any non-API route
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/storage/') || req.path.startsWith('/display') || req.path.startsWith('/docs')) {
      return next();
    }
    res.sendFile(path.join(adminDist, 'index.html'));
  });

  // --- 404 Handler ---
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      code: 'NOT_FOUND',
    });
  });

  // --- Error Handler ---
  app.use(errorHandler);

  return app;
}
