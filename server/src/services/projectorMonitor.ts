import { getDb } from '../lib/db.js';
import { getPJLinkClient } from './pjlink.js';

let intervalId: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const LAMP_HOURS_WARNING = 3000;

export function startProjectorMonitor(): void {
  if (intervalId) return;
  pollProjectors(); // immediate first run
  intervalId = setInterval(pollProjectors, POLL_INTERVAL);
  console.log('  Projector monitor: started (5m interval)');
}

export function stopProjectorMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function pollProjectors(): Promise<void> {
  try {
    const db = getDb();
    const projectors = await db('devices')
      .where({ type: 'projector' })
      .whereNotNull('config');

    for (const projector of projectors) {
      try {
        const config = typeof projector.config === 'string'
          ? JSON.parse(projector.config)
          : projector.config;
        const client = getPJLinkClient(config);
        if (!client) continue;

        const status = await client.getStatus();

        // Update device config with projector status
        await db('devices')
          .where({ id: projector.id })
          .update({
            config: db.raw("config || ?::jsonb", [
              JSON.stringify({
                projector_power: status.power,
                projector_lamp_hours: status.lampHours,
                projector_error: status.errorStatus,
              }),
            ]),
          });

        // Generate alert if lamp hours exceed threshold
        if (status.lampHours && status.lampHours > LAMP_HOURS_WARNING) {
          const existing = await db('alerts')
            .where({
              device_id: projector.id,
              type: 'lamp_hours',
              is_acknowledged: false,
            })
            .first();

          if (!existing) {
            await db('alerts').insert({
              site_id: projector.site_id,
              device_id: projector.id,
              type: 'lamp_hours',
              severity: status.lampHours > 4000 ? 'high' : 'medium',
              message: `Projector "${projector.name}" lamp hours: ${status.lampHours}`,
            });
          }
        }

        // Generate alert for error status
        if (status.errorStatus && status.errorStatus !== '000000') {
          const existing = await db('alerts')
            .where({
              device_id: projector.id,
              type: 'projector_error',
              is_acknowledged: false,
            })
            .first();

          if (!existing) {
            await db('alerts').insert({
              site_id: projector.site_id,
              device_id: projector.id,
              type: 'projector_error',
              severity: 'high',
              message: `Projector "${projector.name}" error: ${status.errorStatus}`,
            });
          }
        }
      } catch (projErr) {
        console.error(`[ProjectorMonitor] Projector ${projector.id} poll failed:`, projErr);
      }
    }
  } catch (err) {
    console.error('[ProjectorMonitor] Polling cycle failed:', err);
  }
}
