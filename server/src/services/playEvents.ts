import { getDb } from '../lib/db.js';

export interface PlayEventInput {
  siteId: string;
  deviceId: string;
  appId?: string | null;
  templateType?: string | null;
  contentId?: string | null;
  playlistId?: string | null;
  title?: string | null;
  contentUrl?: string | null;
  source?: string;
  durationSec?: number | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

/**
 * Append a proof-of-play record. Best-effort: never throws to the caller
 * (play logging must not break real-time message handling).
 */
export async function recordPlayEvent(input: PlayEventInput): Promise<void> {
  try {
    const db = getDb();
    await db('play_events').insert({
      site_id: input.siteId,
      device_id: input.deviceId,
      app_id: asUuid(input.appId),
      template_type: input.templateType ? String(input.templateType).slice(0, 64) : null,
      content_id: asUuid(input.contentId),
      playlist_id: asUuid(input.playlistId),
      title: input.title ? String(input.title).slice(0, 512) : null,
      content_url: input.contentUrl ? String(input.contentUrl) : null,
      source: (input.source || 'app').slice(0, 32),
      duration_sec: typeof input.durationSec === 'number' ? Math.round(input.durationSec) : null,
    });
  } catch (err) {
    console.error(`[PlayEvents] Failed to record play for ${input.deviceId}:`, err);
  }
}
