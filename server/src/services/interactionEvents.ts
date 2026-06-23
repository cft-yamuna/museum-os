import { getDb } from '../lib/db.js';
import { resolveZoneId } from './zoneResolver.js';

/**
 * Bounded taxonomy of visitor interaction event types. Keep in sync with the
 * display emitter (display/src/hooks/useInteractionTelemetry.ts). Unknown types
 * are coerced to 'other' on ingest so event_type cardinality stays bounded.
 */
export const INTERACTION_EVENT_TYPES = [
  'tap',
  'navigate',
  'button-press',
  'carousel-swipe',
  'screensaver-wake',
  'monophone-pickup',
  'poi-open',
  'idle-reset',
  'other',
] as const;

const VALID_EVENT_TYPES = new Set<string>(INTERACTION_EVENT_TYPES);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

export interface InteractionEventInput {
  siteId: string;
  deviceId: string;
  appId?: string | null;
  templateType?: string | null;
  eventType: string;
  target?: string | null;
}

/**
 * Append a visitor interaction record. Best-effort: never throws to the caller
 * (engagement logging must not break real-time display message handling).
 */
export async function recordInteractionEvent(input: InteractionEventInput): Promise<void> {
  try {
    const db = getDb();
    const zoneId = await resolveZoneId(input.deviceId);
    const eventType = VALID_EVENT_TYPES.has(input.eventType) ? input.eventType : 'other';
    await db('interaction_events').insert({
      site_id: input.siteId,
      device_id: input.deviceId,
      zone_id: zoneId,
      app_id: asUuid(input.appId),
      template_type: input.templateType ? String(input.templateType).slice(0, 64) : null,
      event_type: eventType,
      target: input.target ? String(input.target).slice(0, 128) : null,
    });
  } catch (err) {
    console.error(`[InteractionEvents] Failed to record interaction for ${input.deviceId}:`, err);
  }
}
