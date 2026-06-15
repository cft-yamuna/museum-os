/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';
import { sendSuccess } from '../lib/response.js';
import { validateQuery } from '../middleware/validate.js';
import { authUser } from '../middleware/auth.js';
import { pushToAdmins } from '../services/adminWs.js';

const router = Router();

// --- Schemas ---

const listAlertsSchema = z.object({
  site_id: z.string().uuid(),
  device_id: z.string().uuid().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  is_acknowledged: z.enum(['true', 'false']).optional(),
  type: z.string().optional(),
  from_date: z.coerce.date().optional(),
  to_date: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const alertSummarySchema = z.object({
  site_id: z.string().uuid(),
});

// --- Helpers ---

function checkSiteAccess(user: { role: string; site_ids: string[] | null }, siteId: string): void {
  if (user.role === 'super_admin') return;
  if (!user.site_ids || !user.site_ids.includes(siteId)) {
    throw new ForbiddenError('No access to this site');
  }
}

// --- Routes ---

/**
 * GET /api/alerts/summary
 * Alert counts by severity for dashboard badge.
 * Returns counts of unacknowledged alerts grouped by severity.
 *
 * NOTE: This route is registered BEFORE /:id/ack to avoid
 * Express matching "summary" as an :id param.
 */
router.get(
  '/summary',
  authUser,
  validateQuery(alertSummarySchema),
  async (req, res, next) => {
    try {
      const { site_id } = req.query as unknown as { site_id: string };

      if (!req.user) {
        throw new ForbiddenError('User not authenticated');
      }
      checkSiteAccess(req.user, site_id);

      const db = getDb();

      const rows = await db('alerts')
        .where({ site_id, is_acknowledged: false })
        .groupBy('severity')
        .select('severity')
        .count('* as count');

      const summary: Record<string, number> = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
        total: 0,
      };

      for (const row of rows) {
        const sev = row.severity as string;
        const count = Number(row.count);
        if (sev in summary) {
          summary[sev] = count;
        }
        summary.total += count;
      }

      sendSuccess(res, summary);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/alerts
 * List alerts with filters.
 * Query: site_id (required), device_id, severity, is_acknowledged, type, from_date, to_date, limit, offset
 */
router.get(
  '/',
  authUser,
  validateQuery(listAlertsSchema),
  async (req, res, next) => {
    try {
      const {
        site_id,
        device_id,
        severity,
        is_acknowledged,
        type,
        from_date,
        to_date,
        limit = 50,
        offset = 0,
      } = req.query as unknown as {
        site_id: string;
        device_id?: string;
        severity?: string;
        is_acknowledged?: string;
        type?: string;
        from_date?: Date;
        to_date?: Date;
        limit?: number;
        offset?: number;
      };

      if (!req.user) {
        throw new ForbiddenError('User not authenticated');
      }
      checkSiteAccess(req.user, site_id);

      const db = getDb();

      let query = db('alerts').where({ site_id });

      if (severity) {
        query = query.where({ severity });
      }
      if (is_acknowledged !== undefined) {
        query = query.where({ is_acknowledged: is_acknowledged === 'true' });
      }
      if (type) {
        query = query.where({ type });
      }
      if (device_id) {
        query = query.where({ device_id });
      }
      if (from_date) {
        query = query.where('created_at', '>=', from_date);
      }
      if (to_date) {
        query = query.where('created_at', '<=', to_date);
      }

      // Get total count before pagination
      const [{ count: total }] = await query.clone().count('* as count');

      const alerts = await query
        .orderBy('created_at', 'desc')
        .limit(Number(limit))
        .offset(Number(offset));

      sendSuccess(res, { alerts, total: Number(total) });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/alerts/:id/ack
 * Acknowledge an alert.
 * Idempotent: if already acknowledged, returns success.
 */
router.post(
  '/:id/ack',
  authUser,
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      if (!req.user) {
        throw new ForbiddenError('User not authenticated');
      }

      const db = getDb();

      const alert = await db('alerts').where({ id }).first();
      if (!alert) {
        throw new NotFoundError('Alert', id);
      }

      // Check site access via alert's site_id
      checkSiteAccess(req.user, alert.site_id);

      // If already acknowledged, return success (idempotent)
      if (!alert.is_acknowledged) {
        const [updated] = await db('alerts')
          .where({ id })
          .update({
            is_acknowledged: true,
            acknowledged_by: req.user.id,
            acknowledged_at: db.fn.now(),
          })
          .returning('*');

        pushToAdmins({
          type: 'alert:acknowledged',
          payload: {
            alertId: updated.id,
            type: updated.type,
            severity: updated.severity,
            acknowledgedBy: req.user.id,
          },
          timestamp: Date.now(),
        }, updated.site_id);

        sendSuccess(res, updated);
      } else {
        sendSuccess(res, alert);
      }
    } catch (err) {
      next(err);
    }
  }
);

export default router;
