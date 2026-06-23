import { getDb } from '../lib/db.js';
import { resolveZoneId } from './zoneResolver.js';

export interface PresenceEventInput {
  siteId: string;
  deviceId: string;
  state: 'present' | 'clear';
}

/**
 * Append a presence-sensor transition (Present/Clear) for engagement analytics.
 * Best-effort: never throws to the caller (engagement logging must not break
 * real-time hardware-event forwarding). occurred_at defaults to the server clock
 * — the agent's timestamp is treated as advisory only to avoid clock skew.
 */
export async function recordPresenceEvent(input: PresenceEventInput): Promise<void> {
  if (input.state !== 'present' && input.state !== 'clear') return;
  try {
    const db = getDb();
    const zoneId = await resolveZoneId(input.deviceId);
    await db('presence_events').insert({
      site_id: input.siteId,
      device_id: input.deviceId,
      zone_id: zoneId,
      state: input.state,
    });
  } catch (err) {
    console.error(`[PresenceEvents] Failed to record presence for ${input.deviceId}:`, err);
  }
}
