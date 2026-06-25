import { DriverError, type Capability, type DeviceDriver, type DriverAddress, type DriverStatus } from './types.js';

/**
 * Contract-compliant placeholders for device families whose real wire protocol
 * still needs hardware validation (mirrors curato-v2's "⚠️ pending" status for
 * these same families). They keep the registry complete and brand-agnostic:
 * promoting one to a real driver is a single-file change — implement the methods
 * against the documented protocol and swap the class in the registry.
 *
 *   lg-signage        LG RS-232C-over-IP   TCP 9761
 *   epson-escvp21     ESC/VP21             TCP 3629   (PJLink covers day-1 control)
 *   symetrix          Composer CS/GS       TCP 48631
 *   genelec-smartip   Genelec IP / SNMP    UDP/TCP 161
 *   curato-controller ASCII line protocol  TCP 5050
 */
abstract class PendingDriver implements DeviceDriver {
  abstract readonly family: string;
  protected abstract caps: Capability[];
  protected host: string;
  protected port: number;
  constructor(addr: DriverAddress) {
    this.host = addr.host;
    this.port = addr.port;
  }
  async connect() {}
  async disconnect() {}
  capabilities(): Capability[] {
    return this.caps;
  }
  async getStatus(): Promise<DriverStatus> {
    // Reachability only until the protocol is implemented.
    return { power: false, raw: { pending: true, host: this.host, port: this.port } };
  }
  async power(_on: boolean): Promise<void> {
    throw new DriverError(`${this.family} driver pending hardware validation`, 'unsupported');
  }
}

export class LGSignageDriver extends PendingDriver {
  readonly family = 'lg-signage';
  protected caps: Capability[] = ['power', 'input', 'volume', 'mute'];
  constructor(addr: DriverAddress) { super({ ...addr, port: addr.port || 9761 }); }
}

export class EpsonESCVP21Driver extends PendingDriver {
  readonly family = 'epson-escvp21';
  protected caps: Capability[] = ['power', 'input', 'mute'];
  constructor(addr: DriverAddress) { super({ ...addr, port: addr.port || 3629 }); }
}

export class SymetrixDriver extends PendingDriver {
  readonly family = 'symetrix';
  protected caps: Capability[] = ['volume', 'mute'];
  constructor(addr: DriverAddress) { super({ ...addr, port: addr.port || 48631 }); }
}

export class GenelecSmartIPDriver extends PendingDriver {
  readonly family = 'genelec-smartip';
  protected caps: Capability[] = ['volume', 'mute'];
  constructor(addr: DriverAddress) { super({ ...addr, port: addr.port || 161 }); }
}

export class CuratoControllerDriver extends PendingDriver {
  readonly family = 'curato-controller';
  protected caps: Capability[] = ['power'];
  constructor(addr: DriverAddress) { super({ ...addr, port: addr.port || 5050 }); }
}
