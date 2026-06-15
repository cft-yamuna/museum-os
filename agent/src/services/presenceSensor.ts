import { execSync, spawn, type ChildProcess } from 'child_process';
import { platform } from 'os';
import { createReadStream } from 'fs';
import type { WsClient } from './websocket.js';
import type { Logger } from '../lib/logger.js';

/**
 * PresenceSensor — reads line-delimited text from a USB serial presence sensor
 * (HLK-LD2410B via XIAO ESP32C3) and converts state changes to events.
 *
 * Line mapping:
 *   Present  → sensor:present   (person detected)
 *   Clear    → sensor:clear     (person left)
 *   Ready.   → sensor:ready     (sensor booted)
 *
 * Events are forwarded to the server via WebSocket as `presence-sensor:event`.
 * The local event callback broadcasts to Chrome via LocalEventServer.
 *
 * Uses PowerShell on Windows / raw file read on Linux — NO native npm dependencies.
 */
export class PresenceSensor {
  private wsClient: WsClient;
  private logger: Logger;
  private port: string;
  private baudRate: number;
  private running = false;
  private buffer = '';
  private onEvent?: (event: Record<string, unknown>) => void;
  private state: 'present' | 'clear' | 'unknown' = 'unknown';
  private connected = false;
  private detectedPort: string | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private excludePort?: string;

  // Windows-specific: PowerShell process
  private psProcess: ChildProcess | null = null;

  constructor(opts: {
    wsClient: WsClient;
    logger: Logger;
    port?: string;
    baudRate?: number;
    onEvent?: (event: Record<string, unknown>) => void;
    excludePort?: string;
  }) {
    this.wsClient = opts.wsClient;
    this.logger = opts.logger;
    this.port = opts.port || 'auto';
    this.baudRate = opts.baudRate || 115200;
    this.onEvent = opts.onEvent;
    this.excludePort = opts.excludePort;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.logger.info('[Presence] Starting sensor service...');

    if (this.port === 'auto') {
      this.autoDetectAndStart();
    } else {
      this.detectedPort = this.port;
      this.openPort(this.port);
    }
  }

  stop(): void {
    this.running = false;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.psProcess) {
      try { this.psProcess.kill(); } catch { /* ignore */ }
      this.psProcess = null;
    }

    if (this.connected) {
      this.connected = false;
      this.emitEvent('sensor:disconnected');
    }

    this.logger.info('[Presence] Sensor service stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getState(): Record<string, unknown> {
    return {
      state: this.state,
      connected: this.connected,
      port: this.detectedPort,
      running: this.running,
    };
  }

  /**
   * Auto-detect USB serial port by scanning platform-specific paths.
   * Tries each candidate port — the ESP32C3 sends "Ready." on connect.
   */
  private autoDetectAndStart(): void {
    if (!this.running) return;

    const os = platform();
    let candidates: string[] = [];

    try {
      if (os === 'darwin') {
        // macOS: XIAO ESP32C3 appears as /dev/tty.usbmodem*
        const out = execSync('ls /dev/tty.usbmodem* 2>/dev/null || true', { encoding: 'utf-8' }).trim();
        candidates = out ? out.split('\n').filter(Boolean) : [];
      } else if (os === 'win32') {
        // Windows: enumerate USB serial ports via WMI (filters out legacy COM1/COM2)
        const out = execSync(
          'powershell -NoProfile -Command "Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match \'USB Serial Device \\(COM\\d+\\)\' -or $_.Name -match \'USB-SERIAL\\|CH340\\|CP210\\|FTDI\\|usbmodem\' } | ForEach-Object { if ($_.Name -match \'COM(\\d+)\') { \'COM\' + $matches[1] } } | Sort-Object"',
          { encoding: 'utf-8', timeout: 10000 }
        ).trim();
        candidates = out ? out.split(/\r?\n/).filter(Boolean) : [];
        // Fallback: if WMI found nothing, enumerate all but deprioritize COM1/COM2
        if (candidates.length === 0) {
          const allOut = execSync(
            'powershell -NoProfile -Command "[System.IO.Ports.SerialPort]::GetPortNames() -join \',\'"',
            { encoding: 'utf-8', timeout: 5000 }
          ).trim();
          const allPorts = allOut ? allOut.split(',').filter(Boolean) : [];
          // Sort: USB ports (COM3+) first, legacy ports (COM1/COM2) last
          candidates = allPorts.sort((a, b) => {
            const numA = parseInt(a.replace('COM', ''), 10) || 0;
            const numB = parseInt(b.replace('COM', ''), 10) || 0;
            const isLegacyA = numA <= 2 ? 1 : 0;
            const isLegacyB = numB <= 2 ? 1 : 0;
            return isLegacyA - isLegacyB || numA - numB;
          });
        }
      } else {
        // Linux: /dev/ttyACM* or /dev/ttyUSB*
        const out = execSync('ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null || true', { encoding: 'utf-8' }).trim();
        candidates = out ? out.split('\n').filter(Boolean) : [];
      }
    } catch {
      candidates = [];
    }

    // Exclude ports already claimed by serial bridge
    if (this.excludePort) {
      candidates = candidates.filter(p => p !== this.excludePort);
    }

    if (candidates.length === 0) {
      this.logger.debug('[Presence] No USB serial ports found, retrying in 30s...');
      this.scheduleRetry();
      return;
    }

    this.logger.info(`[Presence] Found ${candidates.length} candidate port(s): ${candidates.join(', ')}`);

    // Try candidates in order — prefer USB serial (COM3+) over legacy (COM1/COM2)
    this.tryCandidates(candidates, 0);
  }

  /**
   * Try candidate ports in order. If a port doesn't produce sensor data
   * ("Present" or "Clear") within 10s, move to the next candidate.
   */
  private tryCandidates(candidates: string[], index: number): void {
    if (!this.running || index >= candidates.length) {
      this.logger.warn('[Presence] No working sensor port found, retrying in 30s...');
      this.scheduleRetry();
      return;
    }

    const port = candidates[index];
    this.logger.info(`[Presence] Trying port ${port} (${index + 1}/${candidates.length})...`);
    this.detectedPort = port;

    // If this is not the only candidate, set a probe timeout
    if (candidates.length > 1) {
      const probeTimeout = setTimeout(() => {
        // If state is still unknown after 10s, this is probably the wrong port
        if (this.state === 'unknown' && this.running) {
          this.logger.warn(`[Presence] No sensor data on ${port} after 10s, trying next port...`);
          // Kill the current connection
          if (this.psProcess) {
            try { this.psProcess.kill(); } catch { /* ignore */ }
            this.psProcess = null;
          }
          this.connected = false;
          this.buffer = '';
          this.tryCandidates(candidates, index + 1);
        }
      }, 10_000);

      // Store original emitEvent to detect successful data
      const origState = this.state;
      const checkInterval = setInterval(() => {
        if (this.state !== origState || !this.running) {
          clearTimeout(probeTimeout);
          clearInterval(checkInterval);
        }
      }, 500);

      // Clean up on stop
      const origStop = this.stop.bind(this);
      this.stop = () => {
        clearTimeout(probeTimeout);
        clearInterval(checkInterval);
        this.stop = origStop;
        origStop();
      };
    }

    this.openPort(port);
  }

  private openPort(port: string): void {
    const os = platform();
    if (os === 'win32') {
      this.startWindows(port);
    } else {
      this.startLinux(port);
    }
  }

  /**
   * Windows: Use PowerShell to open the COM port and read lines.
   */
  private startWindows(port: string): void {
    const psScript = `
$port = New-Object System.IO.Ports.SerialPort '${port}', ${this.baudRate}, 'None', 8, 'One'
$port.ReadTimeout = 1000
$port.DtrEnable = $false
$port.RtsEnable = $false
try {
  $port.Open()
  [Console]::Out.WriteLine("PRESENCE_READY")
  while ($true) {
    try {
      $line = $port.ReadLine()
      [Console]::Out.WriteLine($line)
      [Console]::Out.Flush()
    } catch [System.TimeoutException] {
      # Read timeout, just loop
    }
  }
} catch {
  [Console]::Error.WriteLine("PRESENCE_ERROR: $_")
} finally {
  if ($port.IsOpen) { $port.Close() }
}
`;

    this.psProcess = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-Command', psScript,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    this.psProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      if (text.includes('PRESENCE_READY')) {
        this.logger.info(`[Presence] Connected to ${port}`);
        this.connected = true;
        this.emitEvent('sensor:ready');
        return;
      }
      this.processLines(text);
    });

    this.psProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) this.logger.error(`[Presence] Error: ${msg}`);
    });

    this.psProcess.on('exit', (code: number | null) => {
      this.logger.warn(`[Presence] PowerShell exited with code ${code}`);
      this.connected = false;
      this.emitEvent('sensor:disconnected');
      if (this.running) {
        this.logger.info('[Presence] Will restart in 3s...');
        setTimeout(() => {
          if (this.running) this.startWindows(port);
        }, 3000);
      }
    });
  }

  /**
   * Linux/macOS: Read directly from /dev/ttyACMx or /dev/tty.usbmodemx.
   * Configure baud rate with stty first.
   */
  private startLinux(port: string): void {
    const os = platform();

    try {
      if (os === 'darwin') {
        execSync(`stty -f ${port} ${this.baudRate} raw -echo`, { timeout: 5000 });
      } else {
        execSync(`stty -F ${port} ${this.baudRate} raw -echo`, { timeout: 5000 });
      }
    } catch (err) {
      this.logger.error(`[Presence] Failed to configure ${port}:`, err);
      this.scheduleRetry();
      return;
    }

    this.logger.info(`[Presence] Connected to ${port}`);
    this.connected = true;
    this.emitEvent('sensor:ready');

    const stream = createReadStream(port, { encoding: 'utf-8' });

    stream.on('data', (chunk: string | Buffer) => {
      this.processLines(typeof chunk === 'string' ? chunk : chunk.toString('utf-8'));
    });

    stream.on('error', (err: Error) => {
      this.logger.error(`[Presence] Read error: ${err.message}`);
      this.connected = false;
      this.emitEvent('sensor:disconnected');
      if (this.running) {
        this.logger.info('[Presence] Will retry in 5s...');
        setTimeout(() => {
          if (this.running) {
            if (this.port === 'auto') {
              this.autoDetectAndStart();
            } else {
              this.startLinux(port);
            }
          }
        }, 5000);
      }
    });

    stream.on('close', () => {
      this.logger.warn('[Presence] Stream closed');
    });
  }

  /**
   * Process incoming text as line-delimited messages.
   * Accumulates into buffer, splits on newlines.
   */
  private processLines(text: string): void {
    this.buffer += text;
    const lines = this.buffer.split('\n');
    // Keep the last incomplete line in buffer
    this.buffer = lines.pop() || '';

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      if (line === 'Present') {
        if (this.state !== 'present') {
          this.state = 'present';
          this.emitEvent('sensor:present');
        }
      } else if (line === 'Clear') {
        if (this.state !== 'clear') {
          this.state = 'clear';
          this.emitEvent('sensor:clear');
        }
      } else if (line === 'Ready.') {
        this.logger.info('[Presence] Sensor ready signal received');
        this.connected = true;
        this.emitEvent('sensor:ready');
      }
      // Ignore unknown lines
    }
  }

  private emitEvent(type: string): void {
    const event: Record<string, unknown> = {
      type,
      state: this.state,
      timestamp: Date.now(),
    };

    this.logger.info(`[Presence] ${type} (state: ${this.state})`);

    // Send to server (for analytics/logging)
    this.wsClient.send({
      type: 'presence-sensor:event',
      payload: event,
      timestamp: Date.now(),
    });

    // Broadcast locally to Chrome display
    this.onEvent?.(event);
  }

  private scheduleRetry(): void {
    if (!this.running) return;
    this.retryTimer = setTimeout(() => {
      if (this.running) this.autoDetectAndStart();
    }, 30_000);
  }
}
