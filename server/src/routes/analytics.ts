/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { ForbiddenError } from '../lib/errors.js';
import { sendSuccess } from '../lib/response.js';
import { validateQuery } from '../middleware/validate.js';
import { authUser } from '../middleware/auth.js';

const router = Router();

// --- Schemas ---

const overviewSchema = z.object({ site_id: z.string().uuid() });
const zonesSchema = z.object({ site_id: z.string().uuid() });
const timeseriesSchema = z.object({
  site_id: z.string().uuid(),
  hours: z.coerce.number().int().min(1).max(168).optional(),
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

function parseHealth(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return raw as Record<string, unknown>;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

// --- Routes ---

/**
 * GET /api/analytics/overview
 * Fleet KPIs: status breakdown, online %, average health, open-alert counts.
 */
router.get('/overview', authUser, validateQuery(overviewSchema), async (req, res, next) => {
  try {
    const { site_id } = req.query as { site_id: string };
    checkSiteAccess(req, site_id);

    const db = getDb();
    const devices: Array<{ status: string; last_health: unknown }> = await db('devices')
      .where('site_id', site_id)
      .select('status', 'last_health');

    const statusCounts: Record<string, number> = {
      online: 0,
      offline: 0,
      unavailable: 0,
      error: 0,
      restarting: 0,
    };
    const cpu: number[] = [];
    const mem: number[] = [];
    const temp: number[] = [];

    for (const d of devices) {
      statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
      const h = parseHealth(d.last_health);
      if (typeof h.cpuUsage === 'number') cpu.push(h.cpuUsage);
      if (typeof h.memPercent === 'number') mem.push(h.memPercent);
      if (typeof h.cpuTemp === 'number') temp.push(h.cpuTemp);
    }

    const total = devices.length;
    const online = statusCounts.online || 0;

    // Open alerts grouped by severity
    const alertRows: Array<{ severity: string; count: string }> = await db('alerts')
      .where('site_id', site_id)
      .where('is_acknowledged', false)
      .select('severity')
      .count('* as count')
      .groupBy('severity');

    const alertsBySeverity = { low: 0, medium: 0, high: 0, critical: 0, total: 0 };
    for (const row of alertRows) {
      const n = Number(row.count) || 0;
      if (row.severity in alertsBySeverity) {
        (alertsBySeverity as Record<string, number>)[row.severity] = n;
      }
      alertsBySeverity.total += n;
    }

    sendSuccess(res, {
      total,
      status: statusCounts,
      online_pct: total > 0 ? Math.round((online / total) * 1000) / 10 : 0,
      avg_cpu: avg(cpu),
      avg_mem: avg(mem),
      avg_temp: avg(temp),
      alerts: alertsBySeverity,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/analytics/health-timeseries?hours=24
 * Hourly aggregation of device health for charting.
 */
router.get(
  '/health-timeseries',
  authUser,
  validateQuery(timeseriesSchema),
  async (req, res, next) => {
    try {
      const { site_id, hours: rawHours } = req.query as unknown as z.infer<
        typeof timeseriesSchema
      >;
      checkSiteAccess(req, site_id);

      const hours = rawHours || 24;
      const db = getDb();

      const rows = await db('device_health')
        .join('devices', 'device_health.device_id', 'devices.id')
        .where('devices.site_id', site_id)
        .andWhereRaw("device_health.recorded_at >= NOW() - (? || ' hours')::interval", [hours])
        .select(db.raw("date_trunc('hour', device_health.recorded_at) as bucket"))
        .avg('device_health.cpu_usage as avg_cpu')
        .avg('device_health.mem_percent as avg_mem')
        .avg('device_health.cpu_temp as avg_temp')
        .count('* as samples')
        .groupByRaw("date_trunc('hour', device_health.recorded_at)")
        .orderByRaw("date_trunc('hour', device_health.recorded_at) asc");

      const buckets = rows.map((r: Record<string, unknown>) => ({
        bucket: r.bucket,
        avg_cpu: r.avg_cpu !== null ? Math.round(Number(r.avg_cpu) * 10) / 10 : null,
        avg_mem: r.avg_mem !== null ? Math.round(Number(r.avg_mem) * 10) / 10 : null,
        avg_temp: r.avg_temp !== null ? Math.round(Number(r.avg_temp) * 10) / 10 : null,
        samples: Number(r.samples) || 0,
      }));

      sendSuccess(res, { hours, buckets });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/analytics/zones
 * Per-zone health (% of member devices online) for a heatmap.
 */
router.get('/zones', authUser, validateQuery(zonesSchema), async (req, res, next) => {
  try {
    const { site_id } = req.query as { site_id: string };
    checkSiteAccess(req, site_id);

    const db = getDb();
    const rows = await db('device_groups')
      .leftJoin('device_group_members', 'device_groups.id', 'device_group_members.group_id')
      .leftJoin('devices', 'device_group_members.device_id', 'devices.id')
      .where('device_groups.site_id', site_id)
      .where('device_groups.type', 'zone')
      .groupBy('device_groups.id', 'device_groups.name', 'device_groups.color')
      .select('device_groups.id', 'device_groups.name', 'device_groups.color')
      .count('devices.id as total')
      .select(
        db.raw("count(*) FILTER (WHERE devices.status = 'online') as online"),
        db.raw("count(*) FILTER (WHERE devices.status = 'unavailable') as unavailable")
      );

    const zones = rows.map((r: Record<string, unknown>) => {
      const total = Number(r.total) || 0;
      const online = Number(r.online) || 0;
      return {
        id: r.id,
        name: r.name,
        color: r.color || null,
        total,
        online,
        unavailable: Number(r.unavailable) || 0,
        health_pct: total > 0 ? Math.round((online / total) * 1000) / 10 : 0,
      };
    });

    sendSuccess(res, { zones });
  } catch (err) {
    next(err);
  }
});

export default router;
