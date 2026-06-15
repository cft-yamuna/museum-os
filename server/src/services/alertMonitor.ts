import { getDb } from '../lib/db.js';
import { getDiskSpace } from './storage.js';
import { pushToAdmins } from './adminWs.js';

let intervalId: NodeJS.Timeout | null = null;

/**
 * Start the alert monitor background service.
 * Runs every 5 minutes to check system health and generate alerts.
 */
export function startAlertMonitor(): void {
  if (intervalId) return;

  // Run every 5 minutes
  intervalId = setInterval(async () => {
    try {
      await checkDiskSpace();
    } catch (err) {
      console.error('[AlertMonitor] Error:', err);
    }
  }, 5 * 60_000);

  // Run once on start
  checkDiskSpace().catch((err) =>
    console.error('[AlertMonitor] Initial check error:', err)
  );
}

/**
 * Stop the alert monitor background service.
 */
export function stopAlertMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * Check disk space and create alerts if usage is high.
 * - Over 95%: critical severity
 * - Over 90%: medium severity
 * - Deduplicates: won't create a new alert if an unacknowledged one exists from the last 30 minutes
 */
async function checkDiskSpace(): Promise<void> {
  try {
    const space = await getDiskSpace();

    if (space.usedPercent > 90) {
      const db = getDb();

      // Check if we already have a recent unacknowledged disk space alert (last 30 min)
      const recentAlert = await db('alerts')
        .where('type', 'disk_space_low')
        .where('is_acknowledged', false)
        .where('created_at', '>', new Date(Date.now() - 30 * 60_000))
        .first();

      if (!recentAlert) {
        // Get all active sites to create per-site alerts
        const sites = await db('sites').where('is_active', true).select('id');
        const severity = space.usedPercent > 95 ? 'critical' : 'medium';
        const message = `Storage disk space low: ${space.usedPercent.toFixed(1)}% used (${space.freeGB.toFixed(1)} GB free)`;

        for (const site of sites) {
          await db('alerts').insert({
            site_id: site.id,
            type: 'disk_space_low',
            severity,
            message,
          });

          pushToAdmins({
            type: 'device:alert',
            payload: {
              type: 'disk_space_low',
              severity,
              usedPercent: space.usedPercent,
              freeGB: space.freeGB,
            },
            timestamp: Date.now(),
          }, site.id);
        }

        console.log(`[AlertMonitor] Disk space alert: ${space.usedPercent.toFixed(1)}% used`);
      }
    }
  } catch (err) {
    // getDiskSpace might fail on some platforms, don't crash
    console.error('[AlertMonitor] Disk space check failed:', err);
  }
}
