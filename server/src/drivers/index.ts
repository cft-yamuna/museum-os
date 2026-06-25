import type { DeviceDriver } from './types.js';
import { PJLinkDriver } from './pjlink/driver.js';
import { SSSPDriver } from './sssp/driver.js';
import { DALIDriver } from './dali/driver.js';
import { AgentDriver } from './agent/driver.js';
import { SamsungMDCDriver } from './samsung-mdc/driver.js';
import {
  LGSignageDriver,
  EpsonESCVP21Driver,
  SymetrixDriver,
  GenelecSmartIPDriver,
  CuratoControllerDriver,
} from './pending.js';

export * from './types.js';
export {
  PJLinkDriver,
  SSSPDriver,
  DALIDriver,
  AgentDriver,
  SamsungMDCDriver,
  LGSignageDriver,
  EpsonESCVP21Driver,
  SymetrixDriver,
  GenelecSmartIPDriver,
  CuratoControllerDriver,
};

/** Known driver families, for validation/UX (e.g. the device editor dropdown). */
export const DRIVER_FAMILIES = [
  'agent',
  'pjlink',
  'sssp',
  'samsung-mdc',
  'dali',
  'lg-signage',
  'epson-escvp21',
  'symetrix',
  'genelec-smartip',
  'curato-controller',
  'passive',
] as const;
export type DriverFamily = (typeof DRIVER_FAMILIES)[number];

export interface BuildInput {
  id: string;
  driverFamily: string | null;
  ipAddress?: string | null;
  config?: Record<string, unknown>;
}

/**
 * Single source of truth for turning a device row into a driver. Adding a brand
 * is one `case` here plus the driver file — the route/manager layer never changes.
 */
export function buildDriver(d: BuildInput): DeviceDriver | null {
  const config = d.config ?? {};
  const host = (config.host as string) || d.ipAddress || '';
  switch (d.driverFamily) {
    case 'agent':
      return new AgentDriver(d.id);
    case 'pjlink':
      return new PJLinkDriver(config);
    case 'sssp':
      return new SSSPDriver(config);
    case 'dali':
      return new DALIDriver(d.id, config);
    case 'samsung-mdc':
      return new SamsungMDCDriver({
        host: (config.mdc_host as string) || host,
        port: (config.mdc_port as number) || 1515,
        meta: { displayId: (config.mdc_id as number) ?? 0 },
      });
    case 'lg-signage':
      return new LGSignageDriver({ host, port: (config.port as number) || 9761 });
    case 'epson-escvp21':
      return new EpsonESCVP21Driver({ host, port: (config.port as number) || 3629 });
    case 'symetrix':
      return new SymetrixDriver({ host, port: (config.port as number) || 48631 });
    case 'genelec-smartip':
      return new GenelecSmartIPDriver({ host, port: (config.port as number) || 161 });
    case 'curato-controller':
      return new CuratoControllerDriver({ host, port: (config.port as number) || 5050 });
    case 'passive':
    default:
      return null; // status derives from parent (power cascade)
  }
}
