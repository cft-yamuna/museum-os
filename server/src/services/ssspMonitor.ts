import { getDb } from '../lib/db.js';
import { getSSSPClient } from './sssp.js';
import { pushToAdmins } from './adminWs.js';

let intervalId: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL = 60 * 1000; // 60 seconds

export function startSSSPMonitor(): void {
  if (intervalId) return;
  pollSamsungDisplays(); // immediate first run
  intervalId = setInterval(pollSamsungDisplays, POLL_INTERVAL);
  console.log('  SSSP monitor:    started (60s interval)');
}

export function stopSSSPMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function pollSamsungDisplays(): Promise<void> {
  try {
    const db = getDb();
    const displays = await db('devices')
      .where({ type: 'samsung_display' })
      .whereNotNull('config');

    for (const display of displays) {
      try {
        const config = typeof display.config === 'string'
          ? JSON.parse(display.config)
          : display.config;
        const client = getSSSPClient(config);
        if (!client) continue;

        const infoRes = await client.getDeviceInfo();
        if (!infoRes.success || !infoRes.data) {
          // Device unreachable — mark offline if currently online
          if (display.status !== 'offline') {
            await db('devices')
              .where({ id: display.id })
              .update({ status: 'offline', updated_at: db.fn.now() });

            // Create alert for unreachable SSSP device
            const existing = await db('alerts')
              .where({
                device_id: display.id,
                type: 'sssp_unreachable',
                is_acknowledged: false,
              })
              .first();

            if (!existing) {
              await db('alerts').insert({
                site_id: display.site_id,
                device_id: display.id,
                type: 'sssp_unreachable',
                severity: 'high',
                message: `Samsung display "${display.display_name || display.mac_address}" is unreachable via SSSP`,
              });
            }

            pushToAdmins({
              type: 'device:status',
              payload: { deviceId: display.id, status: 'offline' },
              timestamp: Date.now(),
            }, display.site_id);
          }
          continue;
        }

        const info = infoRes.data;

        // Update device with SSSP data
        await db('devices')
          .where({ id: display.id })
          .update({
            status: info.powerState === 'on' ? 'online' : 'offline',
            last_seen: db.fn.now(),
            config: db.raw("config || ?::jsonb", [
              JSON.stringify({
                sssp_power: info.powerState,
                sssp_model: info.modelName,
                sssp_firmware: info.firmwareVersion,
              }),
            ]),
            updated_at: db.fn.now(),
          });

        // Push status update to admin WebSocket
        pushToAdmins({
          type: 'device:status',
          payload: {
            deviceId: display.id,
            status: info.powerState === 'on' ? 'online' : 'offline',
            ssspPower: info.powerState,
          },
          timestamp: Date.now(),
        }, display.site_id);

      } catch (displayErr) {
        console.error(`[SSSPMonitor] Display ${display.id} poll failed:`, displayErr);
      }
    }
  } catch (err) {
    console.error('[SSSPMonitor] Polling cycle failed:', err);
  }
}
