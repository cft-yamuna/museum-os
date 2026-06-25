import { getSSSPClient, SSSPClient } from '../../services/sssp.js';
import { DriverError, type Capability, type DeviceDriver, type DriverStatus } from '../types.js';

/**
 * Samsung SSSP display driver — wraps the existing SSSPClient (Tizen HTTP REST)
 * so Samsung signage fits the unified DeviceDriver contract.
 */
export class SSSPDriver implements DeviceDriver {
  readonly family = 'sssp';
  private client: SSSPClient;

  constructor(config: Record<string, unknown>) {
    const client = getSSSPClient(config);
    if (!client) throw new DriverError('Samsung display has no SSSP host configured', 'not_configured');
    this.client = client;
  }

  async connect() {}
  async disconnect() {}

  capabilities(): Capability[] {
    return ['power', 'restart', 'brightness'];
  }

  async getStatus(): Promise<DriverStatus> {
    const res = await this.client.getDeviceInfo();
    if (!res.success || !res.data) {
      throw new DriverError(`SSSP status failed: ${res.error}`, 'refused');
    }
    const d = res.data;
    return {
      power: d.powerState === 'on',
      firmware: d.firmwareVersion ?? undefined,
      raw: { model: d.modelName, serial: d.serialNumber, powerState: d.powerState },
    };
  }

  async power(on: boolean): Promise<void> {
    const res = on ? await this.client.powerOn() : await this.client.powerOff();
    if (!res.success) throw new DriverError(`SSSP power failed: ${res.error}`, 'protocol');
  }

  async restart(): Promise<void> {
    const res = await this.client.restart();
    if (!res.success) throw new DriverError(`SSSP restart failed: ${res.error}`, 'protocol');
  }

  async setBrightness(n: number): Promise<void> {
    const res = await this.client.setBrightness(n);
    if (!res.success) throw new DriverError(`SSSP brightness failed: ${res.error}`, 'protocol');
  }
}
