import cron from 'node-cron';
import crypto from 'crypto';
import { getDb } from '../lib/db.js';
import { broadcastToDevices, sendToDevice } from './displayWs.js';
import { sendCommandToAgent } from './agentWs.js';
import { pushToAdmins } from './adminWs.js';
import { createAuditLog } from './auditLog.js';
import { sendWolPacket } from './wol.js';
import { getPJLinkClient } from './pjlink.js';
import { getSSSPClient } from './sssp.js';
import { resolveWakeMac } from './deviceWake.js';
import { applyCascadeForParent } from './powerCascade.js';

/** Resolve after `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Types ---

interface ScheduleRecord {
  id: string;
  site_id: string;
  name: string;
  type: string;
  target_type: string;
  target_ids: string[];
  action: string;
  cron_expression: string;
  payload: Record<string, unknown>;
  is_enabled: boolean;
  stagger_seconds?: number | null;
}

interface ExecuteResult {
  success: boolean;
  deviceCount: number;
  error?: string;
}

interface TargetDeviceRecord {
  id: string;
  display_name: string | null;
  mac_address: string | null;
  last_health: Record<string, unknown> | string | null;
  type: string;
  config: Record<string, unknown> | string | null;
  agent_connected: boolean;
  parent_id: string | null;
  power_order: number | null;
}

// --- State ---

/** Map of schedule ID to its active cron task. */
const cronJobs = new Map<string, cron.ScheduledTask>();

// --- Public API ---

/**
 * Start the scheduler: load all enabled schedules from DB and register cron jobs.
 * Called once on server startup after DB connection is verified.
 */
export async function startScheduler(): Promise<void> {
  try {
    const db = getDb();
    const schedules: ScheduleRecord[] = await db('schedules')
      .where('is_enabled', true)
      .select('*');

    for (const schedule of schedules) {
      await registerCronJob(schedule);
    }

    console.log(`  Scheduler:   ${schedules.length} active schedule(s)`);
  } catch (err) {
    console.error('[Scheduler] Failed to start:', err);
  }
}

/**
 * Stop all cron jobs. Called during graceful shutdown.
 */
export function stopScheduler(): void {
  for (const [, task] of cronJobs) {
    task.stop();
  }
  cronJobs.clear();
}

/**
 * Register a single schedule as a cron job.
 * If a job already exists for this schedule, it is replaced.
 * Looks up the site's timezone from the DB; falls back to Asia/Kolkata.
 */
export async function registerCronJob(schedule: ScheduleRecord): Promise<void> {
  // Remove existing job for this schedule if any
  unregisterCronJob(schedule.id);

  if (!cron.validate(schedule.cron_expression)) {
    console.error(
      `[Scheduler] Invalid cron expression for schedule ${schedule.id}: ${schedule.cron_expression}`
    );
    return;
  }

  // Resolve timezone from site
  let timezone = 'Asia/Kolkata';
  try {
    const db = getDb();
    const site = await db('sites')
      .where({ id: schedule.site_id })
      .select('timezone')
      .first();
    if (site && site.timezone) {
      timezone = site.timezone;
    }
  } catch (err) {
    console.warn(`[Scheduler] Could not fetch site timezone for schedule ${schedule.id}, using ${timezone}`);
  }

  const task = cron.schedule(
    schedule.cron_expression,
    async () => {
      await executeSchedule(schedule);
    },
    {
      timezone,
    }
  );

  cronJobs.set(schedule.id, task);
}

/**
 * Unregister (stop + remove) a cron job for a schedule.
 */
export function unregisterCronJob(scheduleId: string): void {
  const existing = cronJobs.get(scheduleId);
  if (existing) {
    existing.stop();
    cronJobs.delete(scheduleId);
  }
}

/**
 * Reload a schedule from DB after update.
 * If the schedule is enabled, re-registers the cron job.
 * If disabled or missing, unregisters any existing job.
 */
export async function reloadSchedule(scheduleId: string): Promise<void> {
  const db = getDb();
  const schedule: ScheduleRecord | undefined = await db('schedules')
    .where({ id: scheduleId })
    .first();

  if (!schedule || !schedule.is_enabled) {
    unregisterCronJob(scheduleId);
    return;
  }

  await registerCronJob(schedule);
}

/**
 * Execute a schedule's action immediately.
 * Called by cron jobs and manual execution endpoint.
 */
export async function executeSchedule(
  schedule: ScheduleRecord
): Promise<ExecuteResult> {
  const startTime = Date.now();

  try {
    const db = getDb();

    // Resolve target devices
    const deviceIds = await resolveTargetDevices(
      db,
      schedule.target_type,
      schedule.target_ids
    );

    if (deviceIds.length === 0) {
      console.log(
        `[Scheduler] No devices found for schedule "${schedule.name}" (${schedule.id})`
      );
      return { success: true, deviceCount: 0 };
    }

    const targetDevices: TargetDeviceRecord[] = await db('devices')
      .whereIn('id', deviceIds)
      .select('id', 'display_name', 'mac_address', 'last_health', 'type', 'config', 'agent_connected', 'parent_id', 'power_order');

    // Execute action
    switch (schedule.action) {
      case 'power_on': {
        await executeScheduledPowerOn(targetDevices, schedule, {
          staggerSeconds: Number(schedule.stagger_seconds) || 0,
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          siteId: schedule.site_id,
        });
        break;
      }

      case 'power_off': {
        await executeScheduledPowerOff(targetDevices, schedule);
        await db('devices')
          .whereIn('id', deviceIds)
          .update({ status: 'offline', updated_at: db.fn.now() });
        break;
      }

      case 'restart':
        broadcastToDevices(deviceIds, {
          type: 'command:reload',
          payload: {
            scheduleId: schedule.id,
            scheduleName: schedule.name,
          },
          timestamp: Date.now(),
        });
        break;

      case 'push_content': {
        const contentId = schedule.payload
          ? (schedule.payload.content_id as string)
          : undefined;
        if (contentId) {
          for (const deviceId of deviceIds) {
            await db('devices')
              .where({ id: deviceId })
              .update({
                config: db.raw('config || ?::jsonb', [
                  JSON.stringify({ assignedContent: contentId }),
                ]),
                updated_at: db.fn.now(),
              });
          }
          broadcastToDevices(deviceIds, {
            type: 'config:updated',
            payload: { contentId, scheduleId: schedule.id },
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'set_playlist': {
        const playlistId = schedule.payload
          ? (schedule.payload.playlist_id as string)
          : undefined;
        if (playlistId) {
          for (const deviceId of deviceIds) {
            await db('devices')
              .where({ id: deviceId })
              .update({
                config: db.raw('config || ?::jsonb', [
                  JSON.stringify({ assignedPlaylist: playlistId }),
                ]),
                updated_at: db.fn.now(),
              });
          }
          broadcastToDevices(deviceIds, {
            type: 'config:updated',
            payload: { playlistId, scheduleId: schedule.id },
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'set_config': {
        const configPayload = schedule.payload
          ? (schedule.payload.config as Record<string, unknown>)
          : undefined;
        if (configPayload) {
          for (const deviceId of deviceIds) {
            await db('devices')
              .where({ id: deviceId })
              .update({
                config: db.raw('config || ?::jsonb', [
                  JSON.stringify(configPayload),
                ]),
                updated_at: db.fn.now(),
              });
          }
          broadcastToDevices(deviceIds, {
            type: 'config:updated',
            payload: { scheduleId: schedule.id },
            timestamp: Date.now(),
          });
        }
        break;
      }

      default:
        console.warn(`[Scheduler] Unknown action: ${schedule.action}`);
    }

    // Audit log
    createAuditLog({
      siteId: schedule.site_id,
      action: 'schedule.executed',
      entityType: 'schedule',
      entityId: schedule.id,
      details: {
        scheduleName: schedule.name,
        action: schedule.action,
        targetDevices: deviceIds.length,
        duration_ms: Date.now() - startTime,
      },
    });

    // Notify admins
    pushToAdmins(
      {
        type: 'schedule:executed',
        payload: {
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          action: schedule.action,
          deviceCount: deviceIds.length,
        },
        timestamp: Date.now(),
      },
      schedule.site_id
    );

    console.log(
      `[Scheduler] Executed "${schedule.name}": ${schedule.action} on ${deviceIds.length} device(s)`
    );

    return { success: true, deviceCount: deviceIds.length };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Scheduler] Failed to execute "${schedule.name}":`, err);

    // Create alert for failed schedule
    try {
      const db = getDb();
      await db('alerts').insert({
        site_id: schedule.site_id,
        type: 'schedule_failed',
        severity: 'medium',
        message: `Schedule "${schedule.name}" failed: ${errorMsg}`,
      });

      pushToAdmins(
        {
          type: 'device:alert',
          payload: {
            type: 'schedule_failed',
            severity: 'medium',
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            error: errorMsg,
          },
          timestamp: Date.now(),
        },
        schedule.site_id
      );
    } catch (alertErr) {
      console.error('[Scheduler] Failed to create alert:', alertErr);
    }

    // Retry once after 30 seconds
    setTimeout(async () => {
      console.log(`[Scheduler] Retrying "${schedule.name}"...`);
      try {
        await executeSchedule(schedule);
      } catch (retryErr) {
        console.error(`[Scheduler] Retry failed for "${schedule.name}":`, retryErr);
      }
    }, 30_000);

    return { success: false, deviceCount: 0, error: errorMsg };
  }
}

/**
 * Get the number of active cron jobs (for health/status endpoints).
 */
export function getActiveJobCount(): number {
  return cronJobs.size;
}

// --- Helpers ---

function toDeviceConfig(raw: TargetDeviceRecord['config']): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return raw;
}

function sendAgentCommand(
  deviceId: string,
  command: string,
  args?: Record<string, unknown>
): boolean {
  const commandId = crypto.randomUUID();
  return sendCommandToAgent(deviceId, {
    type: 'command',
    payload: { id: commandId, command, ...(args ? { args } : {}) },
    timestamp: Date.now(),
  });
}

export interface StaggerContext {
  staggerSeconds: number;
  scheduleId?: string;
  scheduleName?: string;
  siteId?: string;
}

/**
 * Order devices for staggered startup: parents (player PCs) first, then by an
 * explicit power_order (nulls last), then by name for a stable sequence.
 */
export function orderForStartup(devices: TargetDeviceRecord[]): TargetDeviceRecord[] {
  return [...devices].sort((a, b) => {
    const aParent = a.parent_id ? 1 : 0;
    const bParent = b.parent_id ? 1 : 0;
    if (aParent !== bParent) return aParent - bParent;
    const aOrder = a.power_order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.power_order ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.display_name || '').localeCompare(b.display_name || '');
  });
}

/** Power on a single device across all supported transports (WOL/PJLink/SSSP/agent/display). */
async function powerOnDevice(
  device: TargetDeviceRecord,
  schedule?: { id: string; name: string }
): Promise<void> {
  const displayName = device.display_name || device.id;

  const wakeTarget = resolveWakeMac(device);
  if (wakeTarget.mac) {
    try {
      console.log(`[Scheduler] Sending WOL to ${displayName} (${wakeTarget.mac}, source=${wakeTarget.source})`);
      await sendWolPacket(wakeTarget.mac);
    } catch (err) {
      console.error(`[Scheduler] WOL failed for ${displayName}:`, err);
    }
  }

  // Hardware-specific power control
  const config = toDeviceConfig(device.config);
  if (device.type === 'projector') {
    const pjlinkClient = getPJLinkClient(config);
    if (!pjlinkClient) {
      console.warn(`[Scheduler] Projector ${displayName} has no PJLink host configured`);
      return;
    }
    const result = await pjlinkClient.powerOn();
    if (!result.success) {
      console.warn(`[Scheduler] PJLink power_on failed for ${displayName}: ${result.error}`);
    }
    return;
  }
  if (device.type === 'samsung_display') {
    const ssspClient = getSSSPClient(config);
    if (!ssspClient) {
      console.warn(`[Scheduler] Samsung display ${displayName} has no SSSP host configured`);
      return;
    }
    const result = await ssspClient.powerOn();
    if (!result.success) {
      console.warn(`[Scheduler] SSSP power_on failed for ${displayName}: ${result.error}`);
    }
    return;
  }

  const deliveredDisplay = sendToDevice(device.id, {
    type: 'command:activate',
    payload: {
      scheduleId: schedule?.id,
      scheduleName: schedule?.name,
    },
    timestamp: Date.now(),
  });

  // If display client is not connected but agent is online, ask agent to relaunch kiosk.
  if (!deliveredDisplay && device.agent_connected) {
    const deliveredAgent = sendAgentCommand(device.id, 'kiosk:launch', {
      scheduleId: schedule?.id,
      scheduleName: schedule?.name,
    });
    if (!deliveredAgent) {
      console.warn(`[Scheduler] Could not deliver power_on command to ${displayName} (display+agent offline)`);
    }
  }
}

/**
 * Power on a set of devices, optionally with a stagger (gap) between each.
 * Emits scheduler:progress to admins per step and runs the cascade so child
 * devices recover ('unavailable' → 'offline') once their parent comes up.
 */
export async function runStaggeredPowerOn(
  targetDevices: TargetDeviceRecord[],
  ctx: StaggerContext
): Promise<void> {
  const ordered = orderForStartup(targetDevices);
  const total = ordered.length;
  const gapMs = Math.max(0, ctx.staggerSeconds || 0) * 1000;
  const scheduleRef = ctx.scheduleId ? { id: ctx.scheduleId, name: ctx.scheduleName || '' } : undefined;

  for (let i = 0; i < ordered.length; i++) {
    const device = ordered[i];
    await powerOnDevice(device, scheduleRef);

    try {
      await applyCascadeForParent(getDb(), device.id, true);
    } catch (err) {
      console.error(`[Scheduler] Cascade (on) failed for ${device.id}:`, err);
    }

    pushToAdmins(
      {
        type: 'scheduler:progress',
        payload: {
          scheduleId: ctx.scheduleId,
          scheduleName: ctx.scheduleName,
          phase: 'power_on',
          index: i + 1,
          total,
          deviceId: device.id,
          deviceName: device.display_name,
        },
        timestamp: Date.now(),
      },
      ctx.siteId
    );

    if (gapMs > 0 && i < ordered.length - 1) {
      await sleep(gapMs);
    }
  }
}

async function executeScheduledPowerOn(
  targetDevices: TargetDeviceRecord[],
  _schedule: ScheduleRecord,
  ctx: StaggerContext
): Promise<void> {
  await runStaggeredPowerOn(targetDevices, ctx);
}

async function executeScheduledPowerOff(
  targetDevices: TargetDeviceRecord[],
  schedule: ScheduleRecord
): Promise<void> {
  for (const device of targetDevices) {
    const displayName = device.display_name || device.id;
    const config = toDeviceConfig(device.config);

    // Hardware-specific power control
    if (device.type === 'projector') {
      const pjlinkClient = getPJLinkClient(config);
      if (!pjlinkClient) {
        console.warn(`[Scheduler] Projector ${displayName} has no PJLink host configured`);
      } else {
        const result = await pjlinkClient.powerOff();
        if (!result.success) {
          console.warn(`[Scheduler] PJLink power_off failed for ${displayName}: ${result.error}`);
        }
      }
      continue;
    }
    if (device.type === 'samsung_display') {
      const ssspClient = getSSSPClient(config);
      if (!ssspClient) {
        console.warn(`[Scheduler] Samsung display ${displayName} has no SSSP host configured`);
      } else {
        const result = await ssspClient.powerOff();
        if (!result.success) {
          console.warn(`[Scheduler] SSSP power_off failed for ${displayName}: ${result.error}`);
        }
      }
      continue;
    }

    // Put display into idle immediately (visual feedback) when connected.
    sendToDevice(device.id, {
      type: 'command:idle',
      payload: {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
      },
      timestamp: Date.now(),
    });

    // Ask agent to shut down the OS for real power-off.
    if (device.agent_connected) {
      const deliveredAgent = sendAgentCommand(device.id, 'system:shutdown');
      if (!deliveredAgent) {
        console.warn(`[Scheduler] Could not deliver shutdown command to ${displayName}`);
      }
    }
  }

  // Cascade: mark child devices 'unavailable' now that their parent is off.
  for (const device of targetDevices) {
    try {
      await applyCascadeForParent(getDb(), device.id, false);
    } catch (err) {
      console.error(`[Scheduler] Cascade (off) failed for ${device.id}:`, err);
    }
  }
}

export async function resolveTargetDevices(
  db: ReturnType<typeof getDb>,
  targetType: string,
  targetIds: string[]
): Promise<string[]> {
  if (targetType === 'device') {
    return targetIds;
  }
  // group or zone: resolve to member device IDs
  const members = await db('device_group_members')
    .whereIn('group_id', targetIds)
    .select('device_id');
  return [
    ...new Set(members.map((m: { device_id: string }) => m.device_id)),
  ];
}
