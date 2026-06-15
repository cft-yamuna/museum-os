/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';
import { sendSuccess, sendCreated } from '../lib/response.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authUser, requireRole } from '../middleware/auth.js';
import {
  registerCronJob,
  unregisterCronJob,
  reloadSchedule,
  executeSchedule,
} from '../services/scheduler.js';

const router = Router();

// --- Schemas ---

const listSchedulesSchema = z.object({
  site_id: z.string().uuid(),
  type: z.enum(['power', 'content', 'playlist', 'maintenance', 'event']).optional(),
});

const createScheduleSchema = z.object({
  site_id: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(['power', 'content', 'playlist', 'maintenance', 'event']),
  target_type: z.enum(['device', 'group', 'zone']),
  target_ids: z.array(z.string().uuid()).min(1),
  action: z.enum(['power_on', 'power_off', 'push_content', 'set_playlist', 'restart', 'set_config']),
  cron_expression: z.string()
    .regex(/^(\S+\s+){4}\S+$/, 'Invalid cron expression (expected 5 fields)')
    .refine(isValidCron, 'Invalid cron expression (field values out of range)'),
  payload: z.record(z.unknown()).optional(),
  is_enabled: z.boolean().optional(),
  stagger_seconds: z.number().int().min(0).max(3600).nullable().optional(),
});

const updateScheduleSchema = createScheduleSchema.omit({ site_id: true }).partial();

// --- Helpers ---

/**
 * Check that the authenticated user has access to the given site.
 * Super admins always pass; others must have the site in their site_ids.
 */
function checkSiteAccess(req: Express.Request & { user?: { role: string; site_ids: string[] | null } }, siteId: string): void {
  if (req.user?.role === 'super_admin') return;
  if (!req.user?.site_ids || !req.user.site_ids.includes(siteId)) {
    throw new ForbiddenError('No access to this site');
  }
}

/**
 * Validate a single cron field value (number, range, step, list, wildcard).
 * Returns true if every numeric value is within [min, max].
 */
function isValidCronField(field: string, min: number, max: number): boolean {
  // Split on commas first (list support: "1,3,5")
  const parts = field.split(',');
  for (const part of parts) {
    // Step syntax: "*/5" or "1-10/2"
    const [rangeOrVal, stepStr] = part.split('/');
    if (stepStr !== undefined) {
      const step = Number(stepStr);
      if (!Number.isInteger(step) || step < 1) return false;
    }

    if (rangeOrVal === '*') continue;

    // Range syntax: "1-5"
    if (rangeOrVal.includes('-')) {
      const [lowStr, highStr] = rangeOrVal.split('-');
      const low = Number(lowStr);
      const high = Number(highStr);
      if (!Number.isInteger(low) || !Number.isInteger(high)) return false;
      if (low < min || high > max || low > high) return false;
      continue;
    }

    // Single number
    const num = Number(rangeOrVal);
    if (!Number.isInteger(num) || num < min || num > max) return false;
  }
  return true;
}

/**
 * Validate a 5-field cron expression.
 * Fields: minute (0-59), hour (0-23), day-of-month (1-31), month (1-12), day-of-week (0-7).
 */
function isValidCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const ranges: [number, number][] = [
    [0, 59],  // minute
    [0, 23],  // hour
    [1, 31],  // day of month
    [1, 12],  // month
    [0, 7],   // day of week (0 and 7 both = Sunday)
  ];

  return fields.every((field, i) => isValidCronField(field, ranges[i][0], ranges[i][1]));
}

/**
 * Resolve target device IDs based on target type.
 * - 'device': target_ids are device IDs directly
 * - 'group' / 'zone': query device_group_members for each target_id
 */
async function resolveTargetDevices(db: ReturnType<typeof getDb>, targetType: string, targetIds: string[]): Promise<string[]> {
  if (targetType === 'device') {
    return targetIds;
  }
  // For group/zone: get member device IDs
  const members = await db('device_group_members')
    .whereIn('group_id', targetIds)
    .select('device_id');
  return [...new Set(members.map((m: { device_id: string }) => m.device_id))];
}

// --- Routes ---

/**
 * GET /api/schedules
 * List schedules filtered by site_id (required), with optional type filter.
 */
router.get('/', authUser, validateQuery(listSchedulesSchema), async (req, res, next) => {
  try {
    const { site_id, type } = req.query as {
      site_id: string;
      type?: string;
    };

    checkSiteAccess(req, site_id);

    const db = getDb();
    let query = db('schedules').where({ site_id });

    if (type) {
      query = query.where({ type });
    }

    const schedules = await query.orderBy('created_at', 'desc');

    sendSuccess(res, schedules);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/schedules
 * Create a new schedule.
 */
router.post(
  '/',
  authUser,
  requireRole(['super_admin', 'site_admin']),
  validateBody(createScheduleSchema),
  async (req, res, next) => {
    try {
      const {
        site_id,
        name,
        type,
        target_type,
        target_ids,
        action,
        cron_expression,
        payload,
        is_enabled,
        stagger_seconds,
      } = req.body;

      checkSiteAccess(req, site_id);

      const db = getDb();

      const [schedule] = await db('schedules')
        .insert({
          site_id,
          name,
          type,
          target_type,
          target_ids: db.raw('?::uuid[]', ['{' + target_ids.join(',') + '}']),
          action,
          cron_expression,
          payload: payload || null,
          is_enabled: is_enabled !== undefined ? is_enabled : true,
          stagger_seconds: stagger_seconds ?? null,
          created_by: req.user!.id,
        })
        .returning('*');

      // Register cron job if schedule is enabled
      if (schedule.is_enabled) {
        registerCronJob(schedule);
      }

      sendCreated(res, schedule);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/schedules/:id
 * Get a single schedule by ID.
 */
router.get('/:id', authUser, async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const schedule = await db('schedules').where({ id }).first();

    if (!schedule) {
      throw new NotFoundError('Schedule', id);
    }

    checkSiteAccess(req, schedule.site_id);

    sendSuccess(res, schedule);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/schedules/:id
 * Update a schedule.
 */
router.put(
  '/:id',
  authUser,
  requireRole(['super_admin', 'site_admin']),
  validateBody(updateScheduleSchema),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const existingSchedule = await db('schedules').where({ id }).first();
      if (!existingSchedule) {
        throw new NotFoundError('Schedule', id);
      }

      checkSiteAccess(req, existingSchedule.site_id);

      // Build update object from validated body
      const updates: Record<string, unknown> = {};

      if (req.body.name !== undefined) {
        updates.name = req.body.name;
      }
      if (req.body.type !== undefined) {
        updates.type = req.body.type;
      }
      if (req.body.target_type !== undefined) {
        updates.target_type = req.body.target_type;
      }
      if (req.body.target_ids !== undefined) {
        updates.target_ids = db.raw('?::uuid[]', ['{' + req.body.target_ids.join(',') + '}']);
      }
      if (req.body.action !== undefined) {
        updates.action = req.body.action;
      }
      if (req.body.cron_expression !== undefined) {
        updates.cron_expression = req.body.cron_expression;
      }
      if (req.body.payload !== undefined) {
        updates.payload = req.body.payload;
      }
      if (req.body.is_enabled !== undefined) {
        updates.is_enabled = req.body.is_enabled;
      }
      if (req.body.stagger_seconds !== undefined) {
        updates.stagger_seconds = req.body.stagger_seconds;
      }

      const [updatedSchedule] = await db('schedules')
        .where({ id })
        .update(updates)
        .returning('*');

      // Reload cron job (will register if enabled, unregister if disabled)
      await reloadSchedule(id);

      sendSuccess(res, updatedSchedule);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/schedules/:id
 * Hard delete a schedule. Super admin only.
 */
router.delete('/:id', authUser, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const existingSchedule = await db('schedules').where({ id }).first();
    if (!existingSchedule) {
      throw new NotFoundError('Schedule', id);
    }

    checkSiteAccess(req, existingSchedule.site_id);

    await db('schedules').where({ id }).del();

    // Unregister cron job
    unregisterCronJob(id);

    sendSuccess(res, { message: 'Schedule deleted successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/schedules/:id/enable
 * Enable a schedule.
 */
router.post(
  '/:id/enable',
  authUser,
  requireRole(['super_admin', 'site_admin']),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const schedule = await db('schedules').where({ id }).first();
      if (!schedule) {
        throw new NotFoundError('Schedule', id);
      }

      checkSiteAccess(req, schedule.site_id);

      const [updatedSchedule] = await db('schedules')
        .where({ id })
        .update({ is_enabled: true })
        .returning('*');

      // Register cron job for newly enabled schedule
      await reloadSchedule(id);

      sendSuccess(res, updatedSchedule);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/schedules/:id/disable
 * Disable a schedule.
 */
router.post(
  '/:id/disable',
  authUser,
  requireRole(['super_admin', 'site_admin']),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const schedule = await db('schedules').where({ id }).first();
      if (!schedule) {
        throw new NotFoundError('Schedule', id);
      }

      checkSiteAccess(req, schedule.site_id);

      const [updatedSchedule] = await db('schedules')
        .where({ id })
        .update({ is_enabled: false })
        .returning('*');

      // Unregister cron job for disabled schedule
      unregisterCronJob(id);

      sendSuccess(res, updatedSchedule);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/schedules/:id/execute
 * Manual one-time execution.
 * Executes the schedule action on resolved target devices immediately.
 */
router.post(
  '/:id/execute',
  authUser,
  requireRole(['super_admin', 'site_admin']),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const schedule = await db('schedules').where({ id }).first();
      if (!schedule) {
        throw new NotFoundError('Schedule', id);
      }

      checkSiteAccess(req, schedule.site_id);

      // Execute the schedule action on target devices
      const result = await executeSchedule(schedule);

      sendSuccess(res, {
        executed: true,
        action: schedule.action,
        target_devices: result.deviceCount,
        success: result.success,
        error: result.error,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
