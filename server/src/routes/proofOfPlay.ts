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

const ROLES = ['super_admin', 'site_admin', 'content_manager'] as const;
const MAX_CSV_ROWS = 50_000;

// --- Schemas ---

const listSchema = z.object({
  site_id: z.string().uuid(),
  device_id: z.string().uuid().optional(),
  content_id: z.string().uuid().optional(),
  source: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().positive().max(200).optional(),
});

const exportSchema = listSchema.omit({ page: true, per_page: true });
const summarySchema = z.object({
  site_id: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
});

type Filters = z.infer<typeof exportSchema>;

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

function applyFilters(query: Knex.QueryBuilder, filters: Filters): Knex.QueryBuilder {
  query = query.where('play_events.site_id', filters.site_id);
  if (filters.device_id) query = query.where('play_events.device_id', filters.device_id);
  if (filters.content_id) query = query.where('play_events.content_id', filters.content_id);
  if (filters.source) query = query.where('play_events.source', filters.source);
  if (filters.from) query = query.where('play_events.played_at', '>=', filters.from);
  if (filters.to) query = query.where('play_events.played_at', '<=', filters.to);
  return query;
}

function csvCell(value: unknown): string {
  let str: string;
  if (value === null || value === undefined) str = '';
  else if (typeof value === 'object') str = JSON.stringify(value);
  else str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

// --- Routes ---

/**
 * GET /api/proof-of-play
 * Paginated proof-of-play log for a site, with filters.
 */
router.get('/', authUser, requireRole([...ROLES]), validateQuery(listSchema), async (req, res, next) => {
  try {
    const db = getDb();
    const filters = req.query as unknown as z.infer<typeof listSchema>;
    checkSiteAccess(req, filters.site_id);

    const page = filters.page || 1;
    const perPage = filters.per_page || 50;
    const offset = (page - 1) * perPage;

    const countResult = (await applyFilters(db('play_events'), filters)
      .count('play_events.id as count')
      .first()) as unknown as { count: string } | undefined;
    const total = Number(countResult?.count || 0);

    const rows = await applyFilters(
      db('play_events')
        .leftJoin('apps', 'play_events.app_id', 'apps.id')
        .leftJoin('devices', 'play_events.device_id', 'devices.id')
        .select(
          'play_events.id',
          'play_events.played_at',
          'play_events.source',
          'play_events.template_type',
          'play_events.title',
          'play_events.content_url',
          'play_events.content_id',
          'play_events.playlist_id',
          'play_events.duration_sec',
          'devices.display_name as device_name',
          'apps.name as app_name'
        ),
      filters
    )
      .orderBy('play_events.played_at', 'desc')
      .limit(perPage)
      .offset(offset);

    sendSuccess(res, { events: rows, total, page, per_page: perPage });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/proof-of-play/summary
 * Aggregate stats for the dashboard header: totals, by-source, top content.
 */
router.get('/summary', authUser, requireRole([...ROLES]), validateQuery(summarySchema), async (req, res, next) => {
  try {
    const db = getDb();
    const filters = req.query as unknown as z.infer<typeof summarySchema>;
    checkSiteAccess(req, filters.site_id);

    const range: Filters = { site_id: filters.site_id, from: filters.from, to: filters.to };

    const totalRow = (await applyFilters(db('play_events'), range)
      .count('play_events.id as count')
      .first()) as unknown as { count: string } | undefined;

    const bySource = (await applyFilters(db('play_events'), range)
      .select('play_events.source')
      .count('play_events.id as count')
      .groupBy('play_events.source')) as unknown as Array<{ source: string; count: string }>;

    const label = db.raw(
      "coalesce(nullif(play_events.title, ''), apps.name, play_events.template_type, 'Unknown') as label"
    );
    const topContent = (await applyFilters(
      db('play_events').leftJoin('apps', 'play_events.app_id', 'apps.id'),
      range
    )
      .select(label)
      .count('play_events.id as count')
      .groupByRaw("coalesce(nullif(play_events.title, ''), apps.name, play_events.template_type, 'Unknown')")
      .orderBy('count', 'desc')
      .limit(10)) as unknown as Array<{ label: string; count: string }>;

    sendSuccess(res, {
      total: Number(totalRow?.count || 0),
      bySource: bySource.map((r) => ({ source: r.source, count: Number(r.count) })),
      topContent: topContent.map((r) => ({ label: r.label, count: Number(r.count) })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/proof-of-play/export.csv
 * Stream the filtered proof-of-play log as CSV.
 */
router.get('/export.csv', authUser, requireRole([...ROLES]), validateQuery(exportSchema), async (req, res, next) => {
  try {
    const db = getDb();
    const filters = req.query as unknown as Filters;
    checkSiteAccess(req, filters.site_id);

    const rows = await applyFilters(
      db('play_events')
        .leftJoin('apps', 'play_events.app_id', 'apps.id')
        .leftJoin('devices', 'play_events.device_id', 'devices.id')
        .select(
          'play_events.played_at',
          'devices.display_name as device_name',
          'play_events.source',
          'play_events.template_type',
          'apps.name as app_name',
          'play_events.title',
          'play_events.content_url',
          'play_events.duration_sec'
        ),
      filters
    )
      .orderBy('play_events.played_at', 'desc')
      .limit(MAX_CSV_ROWS);

    const header = ['timestamp', 'device', 'source', 'template_type', 'app', 'title', 'content_url', 'duration_sec'];
    const lines = [header.join(',')];
    for (const r of rows as Array<Record<string, unknown>>) {
      lines.push(
        [
          csvCell(r.played_at instanceof Date ? r.played_at.toISOString() : r.played_at),
          csvCell(r.device_name),
          csvCell(r.source),
          csvCell(r.template_type),
          csvCell(r.app_name),
          csvCell(r.title),
          csvCell(r.content_url),
          csvCell(r.duration_sec),
        ].join(',')
      );
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="proof-of-play.csv"');
    res.send(lines.join('\r\n'));
  } catch (err) {
    next(err);
  }
});

export default router;
