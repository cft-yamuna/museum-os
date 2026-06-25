import { getDALIClient, DALIClient } from '../../services/dali.js';
import { DriverError, type Capability, type DeviceDriver, type DriverStatus } from '../types.js';

/**
 * DALI lighting gateway driver — wraps the existing DALIClient. Lighting is
 * infrastructure: `power` maps to broadcast dim full/off, and the dedicated
 * /api/lighting route still drives per-group scenes. Reports lighting-specific
 * capabilities so the UI can offer scene/dim/colorTemp controls.
 */
export class DALIDriver implements DeviceDriver {
  readonly family = 'dali';
  private client: DALIClient;

  constructor(deviceId: string, config: Record<string, unknown>) {
    const client = getDALIClient(deviceId, config);
    if (!client) throw new DriverError('Lighting device has no DALI host configured', 'not_configured');
    this.client = client;
  }

  async connect() {}
  async disconnect() {}

  capabilities(): Capability[] {
    return ['power', 'scene', 'dim', 'colorTemp'];
  }

  async getStatus(): Promise<DriverStatus> {
    // The gateway holds many fixtures with no single power state; treat a live
    // socket as "reachable/on" and a dropped one as off.
    return { power: this.client.isConnected(), raw: { connected: this.client.isConnected() } };
  }

  async power(on: boolean): Promise<void> {
    const res = on
      ? await this.client.setDimLevel(64 /* broadcast */, 100)
      : await this.client.groupOff(0);
    if (!res.success) throw new DriverError(`DALI power failed: ${res.error}`, 'protocol');
  }
}
