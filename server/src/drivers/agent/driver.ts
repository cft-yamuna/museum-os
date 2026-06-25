import crypto from 'crypto';
import { getDb } from '../../lib/db.js';
import { sendCommandToAgent, sendCommandToAgentWithResponse, getAgentClient } from '../../services/agentWs.js';
import { sendWolPacket } from '../../services/wol.js';
import { resolveWakeMac } from '../../services/deviceWake.js';
import { DriverError, type Capability, type DeviceDriver, type DriverStatus } from '../types.js';

/**
 * Agent driver — wraps the existing heavy agent (WebSocket commands + WoL) so
 * PCs/kiosks fit the unified DeviceDriver contract WITHOUT changing the agent.
 *
 *  - power(true)  → Wake-on-LAN magic packet
 *  - power(false) → agent `system:shutdown`
 *  - restart      → agent `system:reboot`
 *  - deploy       → agent `content:deploy`
 *  - attest       → agent `system:attest` (awaits a response)
 *  - getStatus    → reads the health the agent already pushes into devices.last_health
 *
 * The full daemon (Chrome kiosk mgmt, auto-update, serial/presence bridges)
 * keeps working exactly as before; this is purely an adapter over it.
 */
export class AgentDriver implements DeviceDriver {
  readonly family = 'agent';

  constructor(private readonly deviceId: string) {}

  async connect() {}
  async disconnect() {}

  capabilities(): Capability[] {
    return ['power', 'restart', 'deploy', 'attest'];
  }

  private async row(): Promise<Record<string, unknown>> {
    const db = getDb();
    const r = await db('devices').where({ id: this.deviceId }).first();
    if (!r) throw new DriverError(`Device ${this.deviceId} not found`, 'unsupported');
    return r;
  }

  async getStatus(): Promise<DriverStatus> {
    const r = await this.row();
    const connected = Boolean(r.agent_connected);
    const health = (typeof r.last_health === 'string' ? safeParse(r.last_health) : r.last_health) as
      | Record<string, unknown>
      | null;
    const agent = getAgentClient(this.deviceId);
    return {
      power: connected,
      cpuPct: numOrUndef(health?.cpuUsage),
      tempC: numOrUndef(health?.cpuTemp),
      uptimeS: numOrUndef(health?.uptime),
      firmware: agent?.agentVersion,
      raw: { agentConnected: connected, health: health ?? undefined },
    };
  }

  async power(on: boolean): Promise<void> {
    if (on) {
      const r = await this.row();
      const wake = resolveWakeMac(r as never);
      if (!wake.mac) throw new DriverError('No usable MAC for Wake-on-LAN', 'not_configured');
      await sendWolPacket(wake.mac);
      return;
    }
    this.sendOrThrow('system:shutdown');
  }

  async restart(): Promise<void> {
    this.sendOrThrow('system:reboot');
  }

  async deploy(payload: Record<string, unknown>): Promise<void> {
    const delivered = sendCommandToAgent(this.deviceId, {
      type: 'command',
      payload: { id: crypto.randomUUID(), command: 'content:deploy', ...payload },
      timestamp: Date.now(),
    });
    if (!delivered) throw new DriverError('Agent offline; deploy not delivered', 'refused');
  }

  async attest(): Promise<Record<string, unknown>> {
    const id = crypto.randomUUID();
    return sendCommandToAgentWithResponse(this.deviceId, id, {
      type: 'command',
      payload: { id, command: 'system:attest' },
      timestamp: Date.now(),
    });
  }

  private sendOrThrow(command: string): void {
    const delivered = sendCommandToAgent(this.deviceId, {
      type: 'command',
      payload: { id: crypto.randomUUID(), command },
      timestamp: Date.now(),
    });
    if (!delivered) throw new DriverError(`Agent offline; '${command}' not delivered`, 'refused');
  }
}

function numOrUndef(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
