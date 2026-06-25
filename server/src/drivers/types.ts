// The common DeviceDriver contract — ported from curato-v2.
//
// Everything above this interface is identical regardless of the underlying
// transport (PJLink TCP, SSSP HTTP, the agent WebSocket, a raw vendor socket).
// Only the address/handle a concrete driver dials changes. This is what makes
// museum-os brand-agnostic: the route layer talks to `DeviceDriver`, never to a
// specific protocol service.

export interface DriverAddress {
  host: string;
  port: number;
  /** secondary port (e.g. agent port for PCs) */
  port2?: number;
  /** MDC display id, PJLink auth password, etc. */
  meta?: Record<string, string | number>;
}

export interface DriverStatus {
  power: boolean;
  input?: string;
  volume?: number;
  muted?: boolean;
  brightness?: number;
  tempC?: number;
  lampHours?: number;
  cpuPct?: number;
  uptimeS?: number;
  firmware?: string;
  errors?: string[];
  /** protocol-specific extras that don't fit the typed fields above */
  raw?: Record<string, unknown>;
}

/** Standard capability strings. Drivers may also report extras (e.g. 'scene',
 * 'dim', 'colorTemp' for lighting). The UI renders only what is reported. */
export type Capability =
  | 'power'
  | 'restart'
  | 'input'
  | 'volume'
  | 'mute'
  | 'brightness'
  | 'deploy'
  | 'attest'
  | (string & {});

export interface DeviceDriver {
  readonly family: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<DriverStatus>;
  power(on: boolean): Promise<void>;
  setInput?(src: string): Promise<void>;
  setVolume?(n: number): Promise<void>;
  setMute?(b: boolean): Promise<void>;
  setBrightness?(n: number): Promise<void>;
  /** Optional richer actions some families support. */
  restart?(): Promise<void>;
  deploy?(payload: Record<string, unknown>): Promise<void>;
  attest?(): Promise<Record<string, unknown>>;
  capabilities(): Capability[];
}

export type DriverErrorCode =
  | 'timeout'
  | 'refused'
  | 'nak'
  | 'protocol'
  | 'unsupported'
  | 'not_configured';

export class DriverError extends Error {
  constructor(
    message: string,
    public readonly code: DriverErrorCode,
  ) {
    super(message);
    this.name = 'DriverError';
  }
}
