import si from 'systeminformation';
import net from 'net';
import os from 'os';
import { URL } from 'url';
import type { HealthReport, WsMessage } from '../lib/types.js';
import type { WsClient } from './websocket.js';
import type { Logger } from '../lib/logger.js';
import type { DetectedScreen } from '../lib/screens.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isRaspberryPi, getGpuTemp, getThrottled, isSdCardReadOnly } from '../lib/rpi.js';
import { getPlatform } from '../lib/platform.js';

export class HealthMonitor {
  private wsClient: WsClient;
  private logger: Logger;
  private intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private agentVersion: string;
  private serverUrl: string;
  private detectedScreens: DetectedScreen[] = [];
  // Cache static system info (doesn't change between reports)
  private systemInfo: { platform: string; osVersion: string; hostname: string; nodeVersion: string; cpuModel: string; cpuCores: number } | null = null;

  constructor(wsClient: WsClient, logger: Logger, intervalMs: number, serverUrl?: string) {
    this.wsClient = wsClient;
    this.logger = logger;
    this.intervalMs = intervalMs;
    this.serverUrl = serverUrl || '';

    // Read version from package.json
    try {
      const pkg = JSON.parse(
        readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')
      );
      this.agentVersion = pkg.version || '0.0.0';
    } catch {
      this.agentVersion = '0.0.0';
    }
  }

  setScreens(screens: DetectedScreen[]): void {
    this.detectedScreens = screens;
  }

  private async getSystemInfo(): Promise<typeof this.systemInfo> {
    if (this.systemInfo) return this.systemInfo;
    try {
      const [osInfo, cpuInfo] = await Promise.all([si.osInfo(), si.cpu()]);
      this.systemInfo = {
        platform: getPlatform(),
        osVersion: `${osInfo.distro} ${osInfo.release}`.trim(),
        hostname: os.hostname(),
        nodeVersion: process.version,
        cpuModel: `${cpuInfo.manufacturer} ${cpuInfo.brand}`.trim(),
        cpuCores: cpuInfo.cores,
      };
    } catch {
      this.systemInfo = {
        platform: getPlatform(),
        osVersion: `${os.type()} ${os.release()}`,
        hostname: os.hostname(),
        nodeVersion: process.version,
        cpuModel: os.cpus()[0]?.model || 'unknown',
        cpuCores: os.cpus().length,
      };
    }
    return this.systemInfo;
  }

  private selectPrimaryInterface(interfaces: Array<si.Systeminformation.NetworkInterfacesData>): si.Systeminformation.NetworkInterfacesData | null {
    const candidates = interfaces.filter((iface) => !iface.internal && !!iface.ip4);
    if (candidates.length === 0) {
      return null;
    }

    const wired = candidates.find((iface) =>
      iface.type === 'wired' ||
      /ethernet|lan|en\d|eth\d/i.test(iface.iface || '') ||
      /ethernet|lan/i.test(iface.ifaceName || '')
    );

    if (wired) {
      return wired;
    }

    const defaultRoute = candidates.find((iface) => iface.default);
    if (defaultRoute) {
      return defaultRoute;
    }

    return candidates[0] || null;
  }

  start(): void {
    this.logger.info(`Health monitor started (interval: ${this.intervalMs}ms)`);

    // Send initial report after a short delay
    setTimeout(() => {
      this.collectAndSend();
    }, 5_000);

    this.timer = setInterval(() => {
      this.collectAndSend();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.info('Health monitor stopped');
  }

  async collect(): Promise<HealthReport> {
    const [cpu, mem, disk, temp] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.cpuTemperature(),
    ]);

    // Use the first/main disk
    const mainDisk = disk[0] || { size: 0, used: 0, use: 0 };

    const sysInfo = await this.getSystemInfo();

    const report: HealthReport = {
      cpuUsage: Math.round(cpu.currentLoad * 100) / 100,
      memTotal: mem.total,
      memUsed: mem.used,
      memPercent: mem.total > 0 ? Math.round((mem.used / mem.total) * 10000) / 100 : 0,
      diskTotal: mainDisk.size,
      diskUsed: mainDisk.used,
      diskPercent: Math.round(mainDisk.use * 100) / 100,
      cpuTemp: temp.main !== null ? Math.round(temp.main * 10) / 10 : null,
      uptime: Math.round(process.uptime()),
      agentVersion: this.agentVersion,
      // System info
      platform: sysInfo?.platform,
      osVersion: sysInfo?.osVersion,
      hostname: sysInfo?.hostname,
      nodeVersion: sysInfo?.nodeVersion,
      cpuModel: sysInfo?.cpuModel,
      cpuCores: sysInfo?.cpuCores,
      systemUptime: Math.round(os.uptime()),
      // Screen info
      screenCount: this.detectedScreens.length,
      screens: this.detectedScreens.map(s => ({
        hardwareId: s.hardwareId,
        name: s.name,
        width: s.width,
        height: s.height,
        x: s.x,
        y: s.y,
        primary: s.primary,
      })),
    };

    // Add RPi-specific fields when running on Raspberry Pi
    if (isRaspberryPi()) {
      report.gpuTemp = getGpuTemp();
      report.throttled = getThrottled();
      report.sdCardReadOnly = isSdCardReadOnly();
    }

    // Add network info
    try {
      const ifaces = await si.networkInterfaces();
      const ifaceList = Array.isArray(ifaces) ? ifaces : [ifaces];
      const primary = this.selectPrimaryInterface(ifaceList);

      if (primary) {
        let serverLatencyMs: number | null = null;
        if (this.serverUrl) {
          try {
            const url = new URL(this.serverUrl);
            const host = url.hostname;
            const port = parseInt(url.port, 10) || 3001;
            const start = Date.now();
            const reachable = await this.tcpPing(host, port, 5000);
            serverLatencyMs = reachable ? Date.now() - start : null;
          } catch {
            // Ignore ping errors in health collection
          }
        }

        report.network = {
          interface: primary.iface,
          ip: primary.ip4,
          mac: primary.mac,
          serverLatencyMs,
        };
      }
    } catch {
      // Network info is optional, don't fail health collection
    }

    return report;
  }

  private tcpPing(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let resolved = false;

      const done = (result: boolean) => {
        if (resolved) return;
        resolved = true;
        socket.destroy();
        resolve(result);
      };

      socket.setTimeout(timeoutMs);
      socket.on('connect', () => done(true));
      socket.on('timeout', () => done(false));
      socket.on('error', () => done(false));
      socket.connect(port, host);
    });
  }

  private async collectAndSend(): Promise<void> {
    try {
      const report = await this.collect();
      const msg: WsMessage = {
        type: 'agent:health',
        payload: report as unknown as Record<string, unknown>,
        timestamp: Date.now(),
      };
      this.wsClient.send(msg);
      this.logger.debug('Health report sent', {
        cpu: report.cpuUsage,
        mem: report.memPercent,
        disk: report.diskPercent,
      });
    } catch (err) {
      this.logger.error('Failed to collect health data:', err);
    }
  }
}
