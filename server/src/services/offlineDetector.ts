import { getDb } from '../lib/db.js';
import { pushToAdmins } from './adminWs.js';
import { applyCascadeForParent } from './powerCascade.js';

let intervalId: NodeJS.Timeout | null = null;

/**
 * Start the offline detection loop.
 * Runs every 60 seconds.
 * - Finds devices where status != 'offline' AND last_seen < NOW() - 2 minutes
 * - Sets status = 'offline'
 * - Creates an alert for each newly-offline device (type: 'device_offline', severity: 'high')
 */
export function startOfflineDetector(): void {
  if (intervalId) return;

  intervalId = setInterval(async () => {
    try {
      await checkOfflineDevices();
    } catch (err) {
      console.error('[OfflineDetector] Error:', err);
    }
  }, 60_000);

  // Run once immediately
  checkOfflineDevices().catch((err) =>
    console.error('[OfflineDetector] Initial check error:', err)
  );
}

export function stopOfflineDetector(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function checkOfflineDevices(): Promise<void> {
  const db = getDb();
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

  // Find devices that should be marked offline.
  // Exclude 'unavailable' — those are intentionally down via the power cascade
  // (their parent is off) and should not be reclassified as a fault.
  const newlyOffline = await db('devices')
    .whereNotIn('status', ['offline', 'unavailable'])
    .where('last_seen', '<', twoMinutesAgo)
    .whereNotNull('last_seen')
    .select('id', 'site_id', 'display_name', 'mac_address');

  if (newlyOffline.length > 0) {
    // Update status
    const offlineIds = newlyOffline.map((d: { id: string }) => d.id);
    await db('devices')
      .whereIn('id', offlineIds)
      .update({ status: 'offline', updated_at: db.fn.now() });

    // Create alerts
    const alerts = newlyOffline.map((d: { id: string; site_id: string; display_name: string | null; mac_address: string }) => ({
      site_id: d.site_id,
      device_id: d.id,
      type: 'device_offline',
      severity: 'high',
      message: `Device ${d.display_name || d.mac_address} went offline`,
    }));
    await db('alerts').insert(alerts);

    // Push device status and alert events to admin WS
    for (const d of newlyOffline) {
      pushToAdmins({
        type: 'device:status',
        payload: { deviceId: d.id, status: 'offline', displayName: d.display_name || d.mac_address },
        timestamp: Date.now(),
      }, d.site_id);
      pushToAdmins({
        type: 'device:alert',
        payload: { deviceId: d.id, type: 'device_offline', severity: 'high' },
        timestamp: Date.now(),
      }, d.site_id);
    }

    // Cascade: any children of a newly-offline parent become 'unavailable'.
    for (const d of newlyOffline) {
      try {
        await applyCascadeForParent(db, d.id, false);
      } catch (err) {
        console.error(`[OfflineDetector] Cascade failed for ${d.id}:`, err);
      }
    }

    console.log(`[OfflineDetector] Marked ${newlyOffline.length} device(s) offline`);
  }
}
