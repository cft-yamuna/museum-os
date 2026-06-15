type JsonLike = Record<string, unknown> | null | undefined;

export interface WakeMacResolution {
  mac: string | null;
  source: 'last_health' | 'device' | null;
}

function parseJsonObject(value: unknown): JsonLike {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : null;
}

export function normalizeMacAddress(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.replace(/[:\-.\s]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(cleaned)) {
    return null;
  }

  return cleaned.match(/.{2}/g)!.join(':');
}

export function resolveWakeMac(device: {
  mac_address?: unknown;
  last_health?: unknown;
}): WakeMacResolution {
  const lastHealth = parseJsonObject(device.last_health);
  const lastHealthNetwork = parseJsonObject(lastHealth?.network);
  const lastHealthMac = normalizeMacAddress(lastHealthNetwork?.mac);

  if (lastHealthMac) {
    return { mac: lastHealthMac, source: 'last_health' };
  }

  const deviceMac = normalizeMacAddress(device.mac_address);
  if (deviceMac) {
    return { mac: deviceMac, source: 'device' };
  }

  return { mac: null, source: null };
}
