import { getDb } from '../lib/db.js';

const SNAPSHOT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const TTL_DAYS = 7;

let timer: NodeJS.Timeout | null = null;

/**
 * Start periodic health aggregation.
 * Every 5 minutes, snapshot last_health from connected devices into device_health table.
 * Cleans up rows older than 7 days.
 */
export function startHealthAggregator(): void {
  if (timer) return;

  // Run first snapshot after a short delay (30s) to let agents connect
  setTimeout(() => {
    snapshotHealth().catch((err) =>
      console.error('[HealthAggregator] Initial snapshot error:', err)
    );
  }, 30_000);

  timer = setInterval(() => {
    snapshotHealth().catch((err) =>
      console.error('[HealthAggregator] Snapshot error:', err)
    );
  }, SNAPSHOT_INTERVAL);

  console.log('  Health:      aggregator (5m snapshots, 7d TTL)');
}

export function stopHealthAggregator(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function snapshotHealth(): Promise<void> {
  const db = getDb();

  // Get all devices with agent_connected=true and last_health not null
  const devices = await db('devices')
    .where({ agent_connected: true })
    .whereNotNull('last_health')
    .select('id', 'last_health');

  if (devices.length === 0) return;

  const rows = devices
    .map((device) => {
      try {
        const health = typeof device.last_health === 'string'
          ? JSON.parse(device.last_health)
          : device.last_health;

        return {
          device_id: device.id,
          cpu_usage: health.cpuUsage ?? null,
          mem_percent: health.memPercent ?? null,
          disk_percent: health.diskPercent ?? null,
          cpu_temp: health.cpuTemp ?? null,
          uptime: health.uptime ?? null,
        };
      } catch (parseErr) {
        console.error(`[HealthAggregator] Failed to parse health for device ${device.id}:`, parseErr);
        return null;
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length > 0) {
    await db('device_health').insert(rows);
  }

  // Cleanup old records
  const cutoff = new Date(Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db('device_health')
    .where('recorded_at', '<', cutoff)
    .del();

  if (deleted > 0) {
    console.log(`[HealthAggregator] Cleaned up ${deleted} old health records`);
  }
}
