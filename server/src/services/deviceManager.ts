import { EventEmitter } from 'node:events';
import { getDb } from '../lib/db.js';
import { buildDriver, DriverError, type DeviceDriver, type DriverStatus } from '../drivers/index.js';
import { cascadePower } from './powerCascade.js';
import { pushToAdmins } from './adminWs.js';

/**
 * Unified, brand-agnostic device control — ported from curato-v2's DeviceManager
 * and adapted to museum-os (Knex/Postgres + existing power-cascade + admin WS).
 *
 * One driver per device (selected by `driver_family`); every command and every
 * status poll goes through the DeviceDriver contract, replacing the per-type
 * if-chain that used to live in the power route. The existing heavy agent is just
 * another driver family, so kiosk/health/sensor behaviour is unchanged.
 */

export type ManagerAction =
  | 'power_on'
  | 'power_off'
  | 'wake'
  | 'restart'
  | 'input'
  | 'volume'
  | 'mute'
  | 'brightness'
  | 'deploy'
  | 'attest';

interface DeviceRow {
  id: string;
  driver_family: string | null;
  ip_address: string | null;
  config: unknown;
  parent_id: string | null;
  type: string;
  status: string;
}

export interface CommandResult {
  status: string;
  power?: boolean;
  result?: Record<string, unknown>;
}

function parseConfig(c: unknown): Record<string, unknown> {
  if (!c) return {};
  if (typeof c === 'string') {
    try {
      return JSON.parse(c);
    } catch {
      return {};
    }
  }
  return c as Record<string, unknown>;
}

class DeviceManager extends EventEmitter {
  private drivers = new Map<string, DeviceDriver>();
  private pollTimer: NodeJS.Timeout | null = null;
  private pollCursor = 0;
  private pollIntervalMs = 30_000;
  private batch = 25;

  /** Build a driver for a single device row (lazy cache). */
  private async driverFor(id: string): Promise<DeviceDriver | null> {
    if (this.drivers.has(id)) return this.drivers.get(id)!;
    const db = getDb();
    const row: DeviceRow | undefined = await db('devices').where({ id }).first();
    if (!row) return null;
    const drv = buildDriver({
      id: row.id,
      driverFamily: row.driver_family,
      ipAddress: row.ip_address,
      config: parseConfig(row.config),
    });
    if (drv) this.drivers.set(id, drv);
    return drv;
  }

  /** Drop a cached driver (call after a device's config/family changes). */
  invalidate(id: string): void {
    this.drivers.delete(id);
  }

  async capabilitiesOf(id: string): Promise<string[]> {
    const drv = await this.driverFor(id);
    return drv ? drv.capabilities() : [];
  }

  /** On-demand live status through the driver (used by the control drawer). */
  async liveStatus(id: string): Promise<DriverStatus | null> {
    const drv = await this.driverFor(id);
    if (!drv) return null;
    try {
      return await drv.getStatus();
    } catch {
      return null;
    }
  }

  /**
   * Execute a control action through the device's driver. Legacy power actions
   * (power_on/power_off/wake/restart) map onto driver.power()/restart(); the
   * granular ones map onto the optional setters. Updates status + runs cascade,
   * preserving the behaviour the old route had.
   */
  async command(id: string, action: ManagerAction, value?: unknown): Promise<CommandResult> {
    const drv = await this.driverFor(id);
    if (!drv) throw new DriverError(`Device ${id} has no controllable driver`, 'unsupported');

    let result: Record<string, unknown> | undefined;
    switch (action) {
      case 'power_on':
      case 'wake':
        await drv.power(true);
        break;
      case 'power_off':
        await drv.power(false);
        break;
      case 'restart':
        if (drv.restart) await drv.restart();
        else {
          await drv.power(false);
          await drv.power(true);
        }
        break;
      case 'input':
        this.assertCap(drv, 'setInput');
        await drv.setInput!(String(value));
        break;
      case 'volume':
        this.assertCap(drv, 'setVolume');
        await drv.setVolume!(Number(value));
        break;
      case 'mute':
        this.assertCap(drv, 'setMute');
        await drv.setMute!(Boolean(value));
        break;
      case 'brightness':
        this.assertCap(drv, 'setBrightness');
        await drv.setBrightness!(Number(value));
        break;
      case 'deploy':
        if (!drv.deploy) throw new DriverError('Driver cannot deploy content', 'unsupported');
        await drv.deploy((value as Record<string, unknown>) ?? {});
        break;
      case 'attest':
        if (!drv.attest) throw new DriverError('Driver cannot attest', 'unsupported');
        result = await drv.attest();
        break;
    }

    // Mirror the old route's DB status writes + power cascade.
    const db = getDb();
    let status: string | undefined;
    if (action === 'power_off') status = 'offline';
    else if (action === 'restart') status = 'restarting';
    if (status) {
      await db('devices').where({ id }).update({ status, updated_at: db.fn.now() });
    }
    if (action === 'power_on' || action === 'wake') void cascadePower(id, true);
    else if (action === 'power_off') void cascadePower(id, false);

    return { status: status ?? 'ok', result };
  }

  private assertCap(drv: DeviceDriver, method: 'setInput' | 'setVolume' | 'setMute' | 'setBrightness') {
    if (typeof drv[method] !== 'function') {
      throw new DriverError(`${drv.family} does not support ${method}`, 'unsupported');
    }
  }

  /**
   * Poll one device through its driver and reconcile devices.status. Only owns
   * status for *polled protocol* devices; agent-backed devices keep their
   * heartbeat/offline-detector status (their getStatus just mirrors last_health).
   */
  async refresh(id: string): Promise<void> {
    const db = getDb();
    const row: DeviceRow | undefined = await db('devices').where({ id }).first();
    if (!row || !row.driver_family || row.driver_family === 'agent' || row.driver_family === 'passive') {
      return;
    }
    const drv = await this.driverFor(id);
    if (!drv) return;

    let st: DriverStatus | null = null;
    try {
      st = await drv.getStatus();
    } catch {
      st = null;
    }

    const next = this.effectiveStatus(row, st);
    if (next !== row.status) {
      await db('devices').where({ id }).update({ status: next, updated_at: db.fn.now() });
      if (next === 'online') void cascadePower(id, true);
      else if (next === 'offline') void cascadePower(id, false);
    }
    pushToAdmins(
      {
        type: 'device:status',
        payload: { deviceId: id, status: next, telemetry: telemetryOf(st) },
        timestamp: Date.now(),
      },
      undefined,
    );
    this.emit('state', { id, status: next, telemetry: telemetryOf(st) });
  }

  private effectiveStatus(row: DeviceRow, st: DriverStatus | null): string {
    if (!st) return 'offline';
    if (!st.power) return 'offline';
    if ((st.errors && st.errors.length) || (st.tempC ?? 0) > 60) return 'error';
    return 'online';
  }

  /** Rolling poll so a large fleet doesn't burst all at once. */
  startPolling(): void {
    if (this.pollTimer) return;
    const tick = async () => {
      const db = getDb();
      const ids: { id: string }[] = await db('devices')
        .whereNotNull('driver_family')
        .whereNotIn('driver_family', ['agent', 'passive'])
        .select('id');
      if (ids.length === 0) return;
      const slice = ids.slice(this.pollCursor, this.pollCursor + this.batch);
      this.pollCursor = (this.pollCursor + this.batch) % Math.max(1, ids.length);
      await Promise.allSettled(slice.map((r) => this.refresh(r.id)));
    };
    this.pollTimer = setInterval(() => void tick(), this.pollIntervalMs);
    console.log(`  DeviceManager: polling protocol devices every ${this.pollIntervalMs / 1000}s`);
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.drivers.clear();
  }
}

function telemetryOf(st: DriverStatus | null): Record<string, unknown> | undefined {
  if (!st) return undefined;
  return {
    power: st.power,
    input: st.input,
    volume: st.volume,
    muted: st.muted,
    brightness: st.brightness,
    tempC: st.tempC,
    lampHours: st.lampHours,
    cpuPct: st.cpuPct,
    uptimeS: st.uptimeS,
    firmware: st.firmware,
    errors: st.errors,
  };
}

/** Process-wide singleton (mirrors the other museum-os services). */
export const deviceManager = new DeviceManager();
export function startDeviceManager(): void {
  deviceManager.startPolling();
}
export function stopDeviceManager(): void {
  deviceManager.stop();
}
