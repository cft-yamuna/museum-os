/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { NotFoundError } from '../lib/errors.js';
import { sendSuccess, sendError, sendCreated } from '../lib/response.js';
import { validateQuery } from '../middleware/validate.js';
import { authUser, authDevice } from '../middleware/auth.js';

const router = Router();

// --- Schemas ---

const listLogsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(200).default(50),
  level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  source: z.enum(['display', 'agent', 'crash']).optional(),
});

/**
 * GET /api/devices/:id/logs
 * List device logs with pagination and filters.
 * Query: page, per_page, level, source
 */
router.get(
  '/:id/logs',
  authUser,
  validateQuery(listLogsSchema),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      // Verify device exists
      const device = await db('devices').where({ id }).select('id').first();
      if (!device) {
        throw new NotFoundError('Device', id);
      }

      const {
        page = 1,
        per_page = 50,
        level,
        source,
      } = req.query as unknown as {
        page?: number;
        per_page?: number;
        level?: string;
        source?: string;
      };

      let query = db('device_logs').where({ device_id: id });

      if (level) {
        query = query.where({ level });
      }
      if (source) {
        query = query.where({ source });
      }

      // Get total count
      const [{ count: total }] = await query.clone().count('* as count');

      const offset = (Number(page) - 1) * Number(per_page);
      const logs = await query
        .orderBy('created_at', 'desc')
        .limit(Number(per_page))
        .offset(offset);

      sendSuccess(res, { logs, total: Number(total) });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/devices/:id/crash-report
 * Receive crash reports from agent.
 * Auth: device API key.
 */
router.post(
  '/:id/crash-report',
  authDevice,
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      // Verify this is the device's own report
      if (!req.device || req.device.id !== id) {
        sendError(res, 403, 'Device can only submit its own crash reports', 'FORBIDDEN');
        return;
      }

      const report = req.body as Record<string, unknown>;
      const message = `Crash report: ${report.process || 'unknown'} exited (code: ${report.exitCode ?? 'null'})`;

      await db('device_logs').insert({
        device_id: id,
        site_id: req.device.site_id,
        level: 'error',
        message,
        source: 'crash',
        device_timestamp: Date.now(),
        context: JSON.stringify(report),
      });

      sendCreated(res, { received: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
