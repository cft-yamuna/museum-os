/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import type { Knex } from 'knex';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { ForbiddenError } from '../lib/errors.js';
import { sendSuccess } from '../lib/response.js';
import { validateQuery } from '../middleware/validate.js';
import { authUser, requireRole } from '../middleware/auth.js';

const router = Router();

// --- Schemas ---

const listAuditLogsSchema = z.object({
  site_id: z.string().uuid().optional(),
  entity_type: z.string().optional(),
  entity_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  action: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().positive().max(200).optional(),
});

// CSV export reuses the same filters (no pagination).
const exportAuditLogsSchema = listAuditLogsSchema.omit({ page: true, per_page: true });

type AuditFilters = z.infer<typeof exportAuditLogsSchema>;

const MAX_CSV_ROWS = 50_000;

// --- Helpers ---

/**
 * Apply audit-log filters with per-site access enforcement.
 * Shared by the list and CSV-export routes.
 */
function applyAuditFilters(
  query: Knex.QueryBuilder,
  filters: AuditFilters,
  isSuperAdmin: boolean,
  userSiteIds: string[]
): Knex.QueryBuilder {
  const { site_id, entity_type, entity_id, user_id, action, from, to } = filters;

  if (site_id) {
    if (!isSuperAdmin && !userSiteIds.includes(site_id)) {
      throw new ForbiddenError('No access to this site');
    }
    query = query.where('audit_logs.site_id', site_id);
  } else if (!isSuperAdmin) {
    query = query.whereIn('audit_logs.site_id', userSiteIds);
  }

  if (entity_type) query = query.where('audit_logs.entity_type', entity_type);
  if (entity_id) query = query.where('audit_logs.entity_id', entity_id);
  if (user_id) query = query.where('audit_logs.user_id', user_id);
  if (action) query = query.where('audit_logs.action', action);
  if (from) query = query.where('audit_logs.created_at', '>=', from);
  if (to) query = query.where('audit_logs.created_at', '<=', to);

  return query;
}

/** Escape a value for inclusion in a CSV cell. */
function csvCell(value: unknown): string {
  let str: string;
  if (value === null || value === undefined) {
    str = '';
  } else if (typeof value === 'object') {
    str = JSON.stringify(value);
  } else {
    str = String(value);
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// --- Routes ---

/**
 * GET /api/audit-logs
 * Search audit logs with filters.
 * super_admin can see all logs. site_admin sees only their sites.
 */
router.get(
  '/',
  authUser,
  requireRole(['super_admin', 'site_admin']),
  validateQuery(listAuditLogsSchema),
  async (req, res, next) => {
    try {
      const db = getDb();
      const filters = req.query as z.infer<typeof listAuditLogsSchema>;

      const page = filters.page || 1;
      const perPage = filters.per_page || 50;
      const offset = (page - 1) * perPage;

      const isSuperAdmin = req.user?.role === 'super_admin';
      const userSiteIds = req.user?.site_ids || [];

      if (!isSuperAdmin && userSiteIds.length === 0) {
        throw new ForbiddenError('No site access assigned');
      }

      // Count query
      const countQuery = applyAuditFilters(db('audit_logs'), filters, isSuperAdmin, userSiteIds);
      const countResult = (await countQuery.count('audit_logs.id as count').first()) as unknown as
        | { count: string }
        | undefined;
      const total = Number(countResult?.count || 0);

      // Data query with LEFT JOIN on users for name/email
      const dataQuery = applyAuditFilters(
        db('audit_logs')
          .leftJoin('users', 'audit_logs.user_id', 'users.id')
          .select(
            'audit_logs.id',
            'audit_logs.user_id',
            'audit_logs.site_id',
            'audit_logs.action',
            'audit_logs.entity_type',
            'audit_logs.entity_id',
            'audit_logs.details',
            'audit_logs.ip_address',
            'audit_logs.created_at',
            'users.name as user_name',
            'users.email as user_email'
          ),
        filters,
        isSuperAdmin,
        userSiteIds
      )
        .orderBy('audit_logs.created_at', 'desc')
        .limit(perPage)
        .offset(offset);

      const logs = await dataQuery;

      sendSuccess(res, {
        logs,
        total,
        page,
        per_page: perPage,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/audit-logs/export.csv
 * Stream filtered audit logs as a CSV download (same filters as the list route).
 */
router.get(
  '/export.csv',
  authUser,
  requireRole(['super_admin', 'site_admin']),
  validateQuery(exportAuditLogsSchema),
  async (req, res, next) => {
    try {
      const db = getDb();
      const filters = req.query as AuditFilters;

      const isSuperAdmin = req.user?.role === 'super_admin';
      const userSiteIds = req.user?.site_ids || [];

      if (!isSuperAdmin && userSiteIds.length === 0) {
        throw new ForbiddenError('No site access assigned');
      }

      const rows = await applyAuditFilters(
        db('audit_logs')
          .leftJoin('users', 'audit_logs.user_id', 'users.id')
          .select(
            'audit_logs.created_at',
            'users.name as user_name',
            'users.email as user_email',
            'audit_logs.action',
            'audit_logs.entity_type',
            'audit_logs.entity_id',
            'audit_logs.ip_address',
            'audit_logs.details'
          ),
        filters,
        isSuperAdmin,
        userSiteIds
      )
        .orderBy('audit_logs.created_at', 'desc')
        .limit(MAX_CSV_ROWS);

      const header = [
        'timestamp',
        'user',
        'email',
        'action',
        'entity_type',
        'entity_id',
        'ip_address',
        'details',
      ];

      const lines = [header.join(',')];
      for (const r of rows as Array<Record<string, unknown>>) {
        lines.push(
          [
            csvCell(r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at),
            csvCell(r.user_name),
            csvCell(r.user_email),
            csvCell(r.action),
            csvCell(r.entity_type),
            csvCell(r.entity_id),
            csvCell(r.ip_address),
            csvCell(r.details),
          ].join(',')
        );
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
      res.send(lines.join('\r\n'));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
