import { getDb } from '../lib/db.js';

/**
 * Resolves the zone (a device_groups row with type='zone') that a device
 * belongs to, for stamping engagement events. Results are cached in-memory with
 * a short TTL so high-frequency event ingestion (every tap) doesn't hit the DB
 * per event. A device is assumed to belong to at most one zone.
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { zoneId: string | null; expires: number }>();

export async function resolveZoneId(deviceId: string): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(deviceId);
  if (cached && cached.expires > now) return cached.zoneId;

  let zoneId: string | null = null;
  try {
    const db = getDb();
    const row = await db('device_group_members')
      .join('device_groups', 'device_group_members.group_id', 'device_groups.id')
      .where('device_group_members.device_id', deviceId)
      .where('device_groups.type', 'zone')
      .first('device_groups.id as zone_id');
    zoneId = (row?.zone_id as string | undefined) ?? null;
  } catch (err) {
    console.error(`[ZoneResolver] Failed to resolve zone for ${deviceId}:`, err);
    // Fall back to a stale value if we have one rather than dropping attribution.
    return cached?.zoneId ?? null;
  }

  cache.set(deviceId, { zoneId, expires: now + CACHE_TTL_MS });
  return zoneId;
}

/** Invalidate the cache (e.g., after zone membership changes). */
export function clearZoneCache(): void {
  cache.clear();
}
