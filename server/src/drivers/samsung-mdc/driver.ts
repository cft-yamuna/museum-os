import { tcpRequest } from '../tcp.js';
import { DriverError, type Capability, type DeviceDriver, type DriverAddress, type DriverStatus } from '../types.js';
import { buildFrame, parseFrame, MDC } from './codec.js';

/**
 * Samsung MDC driver — controls Samsung commercial displays over the MDC binary
 * protocol (TCP 1515). Implemented from the published MDC spec; validate display
 * id against the panel's configured MDC ID.
 */
export class SamsungMDCDriver implements DeviceDriver {
  readonly family = 'samsung-mdc';
  private host: string;
  private port: number;
  private id: number;

  constructor(addr: DriverAddress) {
    this.host = addr.host;
    this.port = addr.port || 1515;
    this.id = Number(addr.meta?.displayId ?? 0);
  }

  async connect() {}
  async disconnect() {}

  capabilities(): Capability[] {
    return ['power', 'restart', 'input', 'volume', 'mute'];
  }

  private async query(cmd: number, data: number[] = []): Promise<number[]> {
    const resp = await tcpRequest(this.host, this.port, buildFrame(cmd, this.id, data), {
      expectBytes: 7,
      timeoutMs: 3000,
    });
    const parsed = parseFrame(resp);
    if (!parsed.ack) throw new DriverError('MDC NAK', 'nak');
    return parsed.values;
  }

  async getStatus(): Promise<DriverStatus> {
    const power = await this.query(MDC.POWER);
    let volume: number | undefined;
    let muted: boolean | undefined;
    try {
      volume = (await this.query(MDC.VOLUME))[0];
      muted = (await this.query(MDC.MUTE))[0] === 1;
    } catch {
      /* volume/mute optional */
    }
    return { power: power[0] === 1, volume, muted };
  }

  async power(on: boolean): Promise<void> {
    await this.query(MDC.POWER, [on ? 1 : 0]);
  }

  async restart(): Promise<void> {
    await this.power(false);
    await new Promise((r) => setTimeout(r, 1500));
    await this.power(true);
  }

  async setInput(src: string): Promise<void> {
    await this.query(MDC.INPUT, [parseInt(src, 16) & 0xff]);
  }

  async setVolume(n: number): Promise<void> {
    await this.query(MDC.VOLUME, [Math.max(0, Math.min(100, Math.round(n)))]);
  }

  async setMute(b: boolean): Promise<void> {
    await this.query(MDC.MUTE, [b ? 1 : 0]);
  }
}
