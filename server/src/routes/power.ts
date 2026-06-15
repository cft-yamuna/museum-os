/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { ForbiddenError } from '../lib/errors.js';
import { sendSuccess } from '../lib/response.js';
import { validateQuery, validateBody } from '../middleware/validate.js';
import { authUser, requireRole } from '../middleware/auth.js';
import { createAuditLog } from '../services/auditLog.js';
import {
  resolveTargetDevices,
  orderForStartup,
  runStaggeredPowerOn,
} from '../services/scheduler.js';

const router = Router();

// --- Schemas ---

const planSchema = z.object({
  site_id: z.string().uuid(),
  target_type: z.enum(['device', 'group', 'zone']),
  // Comma-separated list of device/group/zone UUIDs.
  target_ids: z.string().min(1),
  stagger_sec: z.coerce.number().int().min(0).max(3600).optional(),
  open_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'open_time must be HH:mm')
    .optional(),
});

const runSchema = z.object({
  site_id: z.string().uuid(),
  target_type: z.enum(['device', 'group', 'zone']),
  target_ids: z.array(z.string().uuid()).min(1),
  stagger_sec: z.number().int().min(0).max(3600).optional(),
});

// --- Helpers ---

function checkSiteAccess(
  req: Express.Request & { user?: { role: string; site_ids: string[] | null } },
  siteId: string
): void {
  if (req.user?.role === 'super_admin') return;
  if (!req.user?.site_ids || !req.user.site_ids.includes(siteId)) {
    throw new ForbiddenError('No access to this site');
  }
}

/** Format a seconds-of-day value (may be negative / overflow) to HH:mm. */
function secondsToClock(totalSeconds: number): string {
  const dayWrapped = ((Math.round(totalSeconds / 60) % 1440) + 1440) % 1440;
  const hh = Math.floor(dayWrapped / 60);
  const mm = dayWrapped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

const ORDER_FIELDS = [
  'id',
  'display_name',
  'mac_address',
  'last_health',
  'type',
  'config',
  'agent_connected',
  'parent_id',
  'power_order',
] as const;

// --- Routes ---

/**
 * GET /api/power/plan
 * Compute a back-timed staggered startup plan (no side effects). The last device
 * powers on at `open_time`; each earlier device is offset by `stagger_sec` before it.
 */
router.get('/plan', authUser, validateQuery(planSchema), async (req, res, next) => {
  try {
    const { site_id, target_type, target_ids, stagger_sec, open_time } =
      req.query as unknown as z.infer<typeof planSchema>;

    checkSiteAccess(req, site_id);

    const db = getDb();
    const ids = target_ids.split(',').map((s) => s.trim()).filter(Boolean);
    const deviceIds = await resolveTargetDevices(db, target_type, ids);

    const devices =
      deviceIds.length > 0
        ? await db('devices')
            .whereIn('id', deviceIds)
            .where('site_id', site_id)
            .select(...ORDER_FIELDS)
        : [];

    const ordered = orderForStartup(devices as never);
    const stagger = stagger_sec ?? 0;
    const total = ordered.length;
    const totalSeconds = total > 0 ? (total - 1) * stagger : 0;

    // openSec: opening time in seconds-of-day (last device powers on then).
    let openSec: number | null = null;
    if (open_time) {
      const [h, m] = open_time.split(':').map(Number);
      openSec = h * 3600 + m * 60;
    }

    const steps = ordered.map((d, i: number) => {
      const offsetSeconds = i * stagger; // from sequence start
      const secondsBeforeOpen = (total - 1 - i) * stagger;
      return {
        index: i + 1,
        device_id: d.id,
        display_name: d.display_name || null,
        type: d.type,
        is_parent: !d.parent_id,
        power_order: d.power_order ?? null,
        offset_seconds: offsetSeconds,
        seconds_before_open: secondsBeforeOpen,
        power_on_at:
          openSec !== null ? secondsToClock(openSec - secondsBeforeOpen) : null,
      };
    });

    sendSuccess(res, {
      total,
      stagger_sec: stagger,
      total_seconds: totalSeconds,
      first_on: steps.length ? steps[0].power_on_at : null,
      last_on: steps.length ? steps[steps.length - 1].power_on_at : null,
      open_time: open_time || null,
      steps,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/power/run
 * Run an ad-hoc staggered power-on sequence immediately. Returns right away;
 * per-device progress is broadcast over the admin WebSocket as 'scheduler:progress'.
 */
router.post(
  '/run',
  authUser,
  requireRole(['super_admin', 'site_admin', 'operator']),
  validateBody(runSchema),
  async (req, res, next) => {
    try {
      const { site_id, target_type, target_ids, stagger_sec } =
        req.body as z.infer<typeof runSchema>;

      checkSiteAccess(req, site_id);

      const db = getDb();
      const deviceIds = await resolveTargetDevices(db, target_type, target_ids);
      const devices =
        deviceIds.length > 0
          ? await db('devices')
              .whereIn('id', deviceIds)
              .where('site_id', site_id)
              .select(...ORDER_FIELDS)
          : [];

      const stagger = stagger_sec ?? 0;
      const estimatedSeconds = devices.length > 0 ? (devices.length - 1) * stagger : 0;

      // Kick off in the background — the request returns immediately.
      void runStaggeredPowerOn(devices as never, {
        staggerSeconds: stagger,
        scheduleName: 'Manual staggered startup',
        siteId: site_id,
      }).catch((err) => {
        console.error('[Power] Staggered run failed:', err);
      });

      createAuditLog({
        userId: req.user?.id,
        siteId: site_id,
        action: 'power.staggered_run',
        entityType: 'site',
        entityId: site_id,
        details: { deviceCount: devices.length, stagger_sec: stagger },
      });

      sendSuccess(res, {
        started: true,
        device_count: devices.length,
        stagger_sec: stagger,
        estimated_seconds: estimatedSeconds,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
