import { getDb } from '../lib/db.js';
import { sendCommandToAgent } from './agentWs.js';

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

interface CacheRefreshMetadata {
  appId?: string;
  requestId?: string;
}

async function findAppIdsByConfigNeedles(siteId: string, needles: string[]): Promise<string[]> {
  const db = getDb();
  const ids = new Set<string>();

  for (const needle of unique(needles)) {
    const rows = await db('apps')
      .select('id')
      .where({ site_id: siteId })
      .whereNull('deleted_at')
      .whereRaw('config::text ILIKE ?', [`%${needle}%`]);

    for (const row of rows as Array<{ id: string }>) {
      ids.add(row.id);
    }
  }

  return Array.from(ids);
}

export async function findAppIdsUsingPlaylist(siteId: string, playlistId: string): Promise<string[]> {
  return findAppIdsByConfigNeedles(siteId, [playlistId]);
}

export async function findAppIdsUsingContent(siteId: string, contentId: string): Promise<string[]> {
  const db = getDb();
  const playlistRows = await db('playlist_items')
    .distinct('playlist_id')
    .where({ content_id: contentId });

  const playlistIds = (playlistRows as Array<{ playlist_id: string }>).map((row) => row.playlist_id);
  return findAppIdsByConfigNeedles(siteId, [contentId, ...playlistIds]);
}

export async function touchApps(appIds: string[]): Promise<void> {
  const ids = unique(appIds);
  if (ids.length === 0) return;

  const db = getDb();
  await db('apps')
    .whereIn('id', ids)
    .update({ updated_at: db.fn.now() });
}

export async function sendCacheRefreshToDevices(
  deviceIds: string[],
  reason: string,
  metadata?: CacheRefreshMetadata
): Promise<string[]> {
  const sentTo: string[] = [];
  for (const deviceId of unique(deviceIds)) {
    const sent = sendCommandToAgent(deviceId, {
      type: 'agent:cache-refresh',
      payload: {
        reason,
        ...(metadata?.appId ? { appId: metadata.appId } : {}),
        ...(metadata?.requestId ? { requestId: metadata.requestId } : {}),
      },
      timestamp: Date.now(),
    });
    if (sent) {
      sentTo.push(deviceId);
    }
  }
  return sentTo;
}

export async function sendCacheRefreshToApps(
  appIds: string[],
  reason: string,
  metadata?: CacheRefreshMetadata
): Promise<string[]> {
  const ids = unique(appIds);
  if (ids.length === 0) return [];

  const db = getDb();
  const rows = await db('devices')
    .select('id')
    .whereIn('app_id', ids);

  const deviceIds = (rows as Array<{ id: string }>).map((row) => row.id);
  return sendCacheRefreshToDevices(deviceIds, reason, metadata);
}

export async function touchAndRefreshApps(appIds: string[], reason: string): Promise<string[]> {
  const ids = unique(appIds);
  if (ids.length === 0) return [];

  await touchApps(ids);
  return sendCacheRefreshToApps(ids, reason);
}

export async function touchAndRefreshAppsUsingPlaylist(siteId: string, playlistId: string, reason: string): Promise<string[]> {
  const appIds = await findAppIdsUsingPlaylist(siteId, playlistId);
  return touchAndRefreshApps(appIds, reason);
}

export async function touchAndRefreshAppsUsingContent(siteId: string, contentId: string, reason: string): Promise<string[]> {
  const appIds = await findAppIdsUsingContent(siteId, contentId);
  return touchAndRefreshApps(appIds, reason);
}
