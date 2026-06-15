/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import { sendSuccess } from '../lib/response.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authDevice, authUser } from '../middleware/auth.js';

const router = Router();

// --- Schemas ---

const heartbeatSchema = z.object({
  status: z.enum(['playing', 'idle', 'error', 'loading']),
  currentContent: z.string().optional(),
  templateType: z.string().optional(),
  uptime: z.number(),
  memoryUsage: z.number().optional(),
  timestamp: z.number(),
});

const deviceLogSchema = z.object({
  entries: z.array(z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']),
    message: z.string(),
    context: z.record(z.unknown()).optional(),
    timestamp: z.number(),
  })).min(1).max(100),
});

const listDeviceLogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
  level: z.enum(['error', 'warn', 'info', 'debug']).optional(),
});

// --- Helpers ---

/**
 * Map heartbeat status to device status.
 * 'playing', 'idle', 'loading' -> 'online'
 * 'error' -> 'error'
 */
function mapDeviceStatus(heartbeatStatus: string): string {
  if (heartbeatStatus === 'error') {
    return 'error';
  }
  return 'online';
}

// --- Routes ---

/**
 * POST /api/devices/:id/heartbeat
 * Process heartbeat from a display client.
 * Updates last_seen, status, and stores heartbeat data in config.
 */
router.post('/:id/heartbeat', authDevice, validateBody(heartbeatSchema), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    // Device can only heartbeat for itself
    if (req.device?.id !== id) {
      throw new ForbiddenError('Device can only send heartbeat for itself');
    }

    const heartbeatData = req.body as z.infer<typeof heartbeatSchema>;
    const deviceStatus = mapDeviceStatus(heartbeatData.status);
    const db = getDb();

    await db('devices')
      .where({ id })
      .update({
        last_seen: db.fn.now(),
        status: deviceStatus,
        config: db.raw("config || ?::jsonb", [JSON.stringify({ lastHeartbeat: heartbeatData })]),
        updated_at: db.fn.now(),
      });

    sendSuccess(res, { received: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/devices/:id/logs
 * Read device logs for admin users. Paginated with optional level filter.
 */
router.get('/:id/logs', authUser, validateQuery(listDeviceLogsSchema), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { page, per_page, level } = req.query as unknown as {
      page: number;
      per_page: number;
      level?: string;
    };

    const db = getDb();

    // Verify device exists and check site access
    const device = await db('devices').where({ id }).first();
    if (!device) {
      throw new NotFoundError('Device', id);
    }

    if (req.user?.role !== 'super_admin') {
      if (!req.user?.site_ids || !req.user.site_ids.includes(device.site_id)) {
        throw new ForbiddenError('No access to this site');
      }
    }

    let query = db('device_logs').where({ device_id: id });
    let countQuery = db('device_logs').where({ device_id: id });

    if (level) {
      query = query.where({ level });
      countQuery = countQuery.where({ level });
    }

    const [{ count }] = await countQuery.count('* as count');
    const total = Number(count);

    const offset = (page - 1) * per_page;
    const logs = await query
      .orderBy('created_at', 'desc')
      .limit(per_page)
      .offset(offset);

    sendSuccess(res, { logs, total, page, per_page });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/devices/:id/logs
 * Accept device logs and store them in device_logs table.
 */
router.post('/:id/logs', authDevice, validateBody(deviceLogSchema), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    // Device can only submit logs for itself
    if (req.device?.id !== id) {
      throw new ForbiddenError('Device can only submit logs for itself');
    }

    const { entries } = req.body as z.infer<typeof deviceLogSchema>;
    const siteId = req.device.site_id;

    const db = getDb();

    const rows = entries.map((entry) => ({
      device_id: id,
      site_id: siteId,
      level: entry.level,
      message: entry.message,
      context: JSON.stringify(entry.context || {}),
      device_timestamp: entry.timestamp,
    }));

    await db('device_logs').insert(rows);

    sendSuccess(res, { received: entries.length });
  } catch (err) {
    next(err);
  }
});

export default router;
