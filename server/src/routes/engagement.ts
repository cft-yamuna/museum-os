/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { ForbiddenError } from '../lib/errors.js';
import { sendSuccess } from '../lib/response.js';
import { validateQuery } from '../middleware/validate.js';
import { authUser, requireRole } from '../middleware/auth.js';

const router = Router();

const ROLES = ['super_admin', 'site_admin', 'content_manager'] as const;
const MAX_CSV_ROWS = 50_000;
// Default to the museum's local timezone so hour-of-day widgets read in clock
// time, not UTC. Overridable per request via ?tz=. Validated to an IANA-ish
// shape and passed as a bound parameter (never interpolated).
const DEFAULT_TZ = 'Asia/Kolkata';
const TZ_RE = /^[A-Za-z0-9_+\-/]{1,64}$/;

// --- Schemas ---

const windowSchema = z.object({
  site_id: z.string().uuid(),
  hours: z.coerce.number().int().min(1).max(8760).optional(),
  tz: z.string().max(64).optional(),
});

const exportSchema = z.object({
  site_id: z.string().uuid(),
  hours: z.coerce.number().int().min(1).max(8760).optional(),
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

function safeTz(tz: string | undefined): string {
  return tz && TZ_RE.test(tz) ? tz : DEFAULT_TZ;
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
 * GET /api/engagement/summary
 * KPI strip: total interactions, total occupancy sessions, average dwell, and
 * the busiest hour-of-day + top exhibits over the window.
 */
router.get('/summary', authUser, requireRole([...ROLES]), validateQuery(windowSchema), async (req, res, next) => {
  try {
    const { site_id, hours: rawHours, tz: rawTz } = req.query as unknown as z.infer<typeof windowSchema>;
    checkSiteAccess(req, site_id);
    const hours = rawHours || 24;
    const tz = safeTz(rawTz);
    const db = getDb();

    const totals = (await db('engagement_rollup')
      .where('site_id', site_id)
      .andWhereRaw(`bucket >= now() - (? || ' hours')::interval`, [hours])
      .select(
        db.raw('COALESCE(SUM(interaction_count), 0)::bigint as interactions'),
        db.raw('COALESCE(SUM(presence_sessions), 0)::bigint as sessions'),
        db.raw('COALESCE(SUM(dwell_seconds_sum), 0)::bigint as dwell')
      )
      .first()) as unknown as { interactions: string; sessions: string; dwell: string } | undefined;

    const busiest = (await db('engagement_rollup')
      .where('site_id', site_id)
      .andWhereRaw(`bucket >= now() - (? || ' hours')::interval`, [hours])
      .select(db.raw('EXTRACT(HOUR FROM bucket AT TIME ZONE ?)::int as hour', [tz]))
      .sum('interaction_count as cnt')
      .groupByRaw('hour')
      .orderBy('cnt', 'desc')
      .first()) as unknown as { hour: number; cnt: string } | undefined;

    const topExhibits = (await db('engagement_rollup as er')
      .join('device_groups as dg', 'er.zone_id', 'dg.id')
      .where('er.site_id', site_id)
      .andWhereRaw(`er.bucket >= now() - (? || ' hours')::interval`, [hours])
      .select('dg.id', 'dg.name', 'dg.color')
      .sum('er.interaction_count as interactions')
      .groupBy('dg.id', 'dg.name', 'dg.color')
      .orderBy('interactions', 'desc')
      .limit(3)) as unknown as Array<{ id: string; name: string; color: string | null; interactions: string }>;

    const sessions = Number(totals?.sessions || 0);
    const dwell = Number(totals?.dwell || 0);

    sendSuccess(res, {
      hours,
      tz,
      total_interactions: Number(totals?.interactions || 0),
      total_sessions: sessions,
      avg_dwell_sec: sessions > 0 ? Math.round(dwell / sessions) : 0,
      busiest_hour: busiest ? Number(busiest.hour) : null,
      top_exhibits: topExhibits.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color || null,
        interactions: Number(r.interactions),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/engagement/dwell-by-exhibit
 * Per-zone occupancy dwell + interaction totals (all zones, including idle
 * ones). Serves both the dwell and interaction bar widgets.
 */
router.get('/dwell-by-exhibit', authUser, requireRole([...ROLES]), validateQuery(windowSchema), async (req, res, next) => {
  try {
    const { site_id, hours: rawHours } = req.query as unknown as z.infer<typeof windowSchema>;
    checkSiteAccess(req, site_id);
    const hours = rawHours || 24;
    const db = getDb();

    const zones = (await db('device_groups')
      .where({ site_id, type: 'zone' })
      .select('id', 'name', 'color')) as Array<{ id: string; name: string; color: string | null }>;

    const aggRows = (await db('engagement_rollup')
      .where('site_id', site_id)
      .andWhereRaw(`bucket >= now() - (? || ' hours')::interval`, [hours])
      .whereNotNull('zone_id')
      .select('zone_id')
      .sum('presence_sessions as sessions')
      .sum('dwell_seconds_sum as dwell')
      .sum('interaction_count as interactions')
      .groupBy('zone_id')) as unknown as Array<{
      zone_id: string;
      sessions: string;
      dwell: string;
      interactions: string;
    }>;

    const byZone = new Map(aggRows.map((r) => [r.zone_id, r]));
    const exhibits = zones
      .map((z) => {
        const a = byZone.get(z.id);
        const sessions = Number(a?.sessions || 0);
        const dwellSeconds = Number(a?.dwell || 0);
        return {
          zone_id: z.id,
          name: z.name,
          color: z.color || null,
          sessions,
          dwell_seconds: dwellSeconds,
          avg_dwell_sec: sessions > 0 ? Math.round(dwellSeconds / sessions) : 0,
          interactions: Number(a?.interactions || 0),
        };
      })
      .sort((a, b) => b.dwell_seconds - a.dwell_seconds);

    sendSuccess(res, { hours, exhibits });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/engagement/heatmap
 * Zone x hour-of-day interaction heatmap. Bounded to zones x 24 cells.
 */
router.get('/heatmap', authUser, requireRole([...ROLES]), validateQuery(windowSchema), async (req, res, next) => {
  try {
    const { site_id, hours: rawHours, tz: rawTz } = req.query as unknown as z.infer<typeof windowSchema>;
    checkSiteAccess(req, site_id);
    const hours = rawHours || 24;
    const tz = safeTz(rawTz);
    const db = getDb();

    const zones = (await db('device_groups')
      .where({ site_id, type: 'zone' })
      .select('id', 'name', 'color')) as Array<{ id: string; name: string; color: string | null }>;

    const cellRows = (await db('engagement_rollup')
      .where('site_id', site_id)
      .andWhereRaw(`bucket >= now() - (? || ' hours')::interval`, [hours])
      .whereNotNull('zone_id')
      .select('zone_id', db.raw('EXTRACT(HOUR FROM bucket AT TIME ZONE ?)::int as hour', [tz]))
      .sum('interaction_count as cnt')
      .groupBy('zone_id')
      .groupByRaw('hour')) as unknown as Array<{
      zone_id: string;
      hour: number;
      cnt: string;
    }>;

    const cells: Record<string, number[]> = {};
    for (const z of zones) cells[z.id] = new Array(24).fill(0);
    for (const r of cellRows) {
      const hour = Number(r.hour);
      if (cells[r.zone_id] && hour >= 0 && hour < 24) {
        cells[r.zone_id][hour] = Number(r.cnt) || 0;
      }
    }

    sendSuccess(res, {
      hours,
      tz,
      zones: zones.map((z) => ({ id: z.id, name: z.name, color: z.color || null })),
      hour_labels: Array.from({ length: 24 }, (_, i) => i),
      cells,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/engagement/busiest-hours
 * 24-point hour-of-day curve of interactions and occupancy sessions.
 */
router.get('/busiest-hours', authUser, requireRole([...ROLES]), validateQuery(windowSchema), async (req, res, next) => {
  try {
    const { site_id, hours: rawHours, tz: rawTz } = req.query as unknown as z.infer<typeof windowSchema>;
    checkSiteAccess(req, site_id);
    const hours = rawHours || 24;
    const tz = safeTz(rawTz);
    const db = getDb();

    const rows = (await db('engagement_rollup')
      .where('site_id', site_id)
      .andWhereRaw(`bucket >= now() - (? || ' hours')::interval`, [hours])
      .select(db.raw('EXTRACT(HOUR FROM bucket AT TIME ZONE ?)::int as hour', [tz]))
      .sum('interaction_count as interactions')
      .sum('presence_sessions as sessions')
      .groupByRaw('hour')) as unknown as Array<{
      hour: number;
      interactions: string;
      sessions: string;
    }>;

    const byHour = new Map(rows.map((r) => [Number(r.hour), r]));
    const curve = Array.from({ length: 24 }, (_, h) => {
      const r = byHour.get(h);
      return {
        hour: h,
        interactions: Number(r?.interactions || 0),
        sessions: Number(r?.sessions || 0),
      };
    });

    sendSuccess(res, { hours, tz, curve });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/engagement/export.csv
 * Stream raw interaction events (device, zone, app, type) as CSV.
 */
router.get('/export.csv', authUser, requireRole([...ROLES]), validateQuery(exportSchema), async (req, res, next) => {
  try {
    const { site_id, hours: rawHours } = req.query as unknown as z.infer<typeof exportSchema>;
    checkSiteAccess(req, site_id);
    const hours = rawHours || 24;
    const db = getDb();

    const rows = (await db('interaction_events as ie')
      .leftJoin('devices as d', 'ie.device_id', 'd.id')
      .leftJoin('device_groups as z', 'ie.zone_id', 'z.id')
      .leftJoin('apps as a', 'ie.app_id', 'a.id')
      .where('ie.site_id', site_id)
      .andWhereRaw(`ie.occurred_at >= now() - (? || ' hours')::interval`, [hours])
      .select(
        'ie.occurred_at',
        'd.display_name as device_name',
        'z.name as zone_name',
        'ie.event_type',
        'ie.template_type',
        'a.name as app_name',
        'ie.target'
      )
      .orderBy('ie.occurred_at', 'desc')
      .limit(MAX_CSV_ROWS)) as Array<Record<string, unknown>>;

    const header = ['timestamp', 'device', 'zone', 'event_type', 'template_type', 'app', 'target'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          csvCell(r.occurred_at instanceof Date ? r.occurred_at.toISOString() : r.occurred_at),
          csvCell(r.device_name),
          csvCell(r.zone_name),
          csvCell(r.event_type),
          csvCell(r.template_type),
          csvCell(r.app_name),
          csvCell(r.target),
        ].join(',')
      );
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="engagement.csv"');
    res.send(lines.join('\r\n'));
  } catch (err) {
    next(err);
  }
});

export default router;
