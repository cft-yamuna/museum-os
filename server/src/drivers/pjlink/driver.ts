import { getPJLinkClient, PJLinkClient } from '../../services/pjlink.js';
import { DriverError, type Capability, type DeviceDriver, type DriverStatus } from '../types.js';

/**
 * PJLink projector driver — wraps the existing PJLinkClient service so projectors
 * fit the unified DeviceDriver contract. No new protocol code; this is an adapter.
 */
export class PJLinkDriver implements DeviceDriver {
  readonly family = 'pjlink';
  private client: PJLinkClient;

  constructor(config: Record<string, unknown>) {
    const client = getPJLinkClient(config);
    if (!client) throw new DriverError('Projector has no PJLink host configured', 'not_configured');
    this.client = client;
  }

  async connect() {}
  async disconnect() {}

  capabilities(): Capability[] {
    return ['power', 'restart', 'input', 'mute'];
  }

  async getStatus(): Promise<DriverStatus> {
    const s = await this.client.getStatus();
    const errors: string[] = [];
    // PJLink ERST returns 6 chars; '000000' = no error. Surface anything else.
    if (s.errorStatus && s.errorStatus !== '000000') errors.push(s.errorStatus);
    return {
      power: s.power === 'on' || s.power === 'warmup',
      lampHours: s.lampHours ?? undefined,
      input: s.inputSource ?? undefined,
      errors: errors.length ? errors : undefined,
      raw: { pjlinkPower: s.power },
    };
  }

  async power(on: boolean): Promise<void> {
    const res = on ? await this.client.powerOn() : await this.client.powerOff();
    if (!res.success) throw new DriverError(`PJLink power failed: ${res.error}`, 'protocol');
  }

  async restart(): Promise<void> {
    // Projectors warm up on their own; sending power-off begins the restart cycle.
    const res = await this.client.powerOff();
    if (!res.success) throw new DriverError(`PJLink restart failed: ${res.error}`, 'protocol');
  }

  async setInput(src: string): Promise<void> {
    const res = await this.client.selectInput(src);
    if (!res.success) throw new DriverError(`PJLink input failed: ${res.error}`, 'protocol');
  }

  async setMute(b: boolean): Promise<void> {
    const res = b ? await this.client.muteOn() : await this.client.muteOff();
    if (!res.success) throw new DriverError(`PJLink mute failed: ${res.error}`, 'protocol');
  }
}
