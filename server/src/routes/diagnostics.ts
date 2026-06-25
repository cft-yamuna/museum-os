/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { ForbiddenError } from '../lib/errors.js';
import { sendSuccess } from '../lib/response.js';
import { validateBody } from '../middleware/validate.js';
import { authUser, requireMinRole } from '../middleware/auth.js';
import { createAuditLog } from '../services/auditLog.js';
import { deviceManager } from '../services/deviceManager.js';
import { DriverError } from '../drivers/index.js';
import { sendCacheRefreshToDevices } from '../services/appRefresh.js';

const router = Router();

function checkSiteAccess(
  req: Express.Request & { user?: { role: string; site_ids: string[] | null } },
  siteId: string,
): void {
  if (req.user?.role === 'super_admin') return;
  if (!req.user?.site_ids || !req.user.site_ids.includes(siteId)) {
    throw new ForbiddenError('No access to this site');
  }
}

const siteSchema = z.object({
  site_id: z.string().uuid(),
  stagger_sec: z.number().int().min(0).max(60).optional(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function siteDeviceIds(siteId: string): Promise<{ id: string; driver_family: string | null }[]> {
  const db = getDb();
  return db('devices').where({ site_id: siteId }).select('id', 'driver_family');
}

/**
 * POST /api/diagnostics/restart-all — staggered restart of every device in a
 * site through the unified driver path. Operator+.
 */
router.post('/restart-all', authUser, requireMinRole('operator'), validateBody(siteSchema), async (req, res, next) => {
  try {
    const { site_id, stagger_sec = 5 } = req.body as z.infer<typeof siteSchema>;
    checkSiteAccess(req, site_id);
    const devices = await siteDeviceIds(site_id);

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (let i = 0; i < devices.length; i++) {
      try {
        await deviceManager.command(devices[i].id, 'restart');
        results.push({ id: devices[i].id, ok: true });
      } catch (err) {
        results.push({ id: devices[i].id, ok: false, error: err instanceof DriverError ? err.message : 'failed' });
      }
      if (stagger_sec > 0 && i < devices.length - 1) await sleep(stagger_sec * 1000);
    }
    createAuditLog({ userId: req.user?.id, siteId: site_id, action: 'diagnostics.restart_all', details: { count: devices.length } });
    sendSuccess(res, { total: devices.length, results });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/diagnostics/attest-all — request attestation from every device whose
 * driver supports it (agent PCs). Operator+.
 */
router.post('/attest-all', authUser, requireMinRole('operator'), validateBody(siteSchema), async (req, res, next) => {
  try {
    const { site_id } = req.body as z.infer<typeof siteSchema>;
    checkSiteAccess(req, site_id);
    const devices = await siteDeviceIds(site_id);

    const results: Array<{ id: string; ok: boolean; result?: unknown; error?: string }> = [];
    for (const d of devices) {
      try {
        const out = await deviceManager.command(d.id, 'attest');
        results.push({ id: d.id, ok: true, result: out.result });
      } catch (err) {
        results.push({ id: d.id, ok: false, error: err instanceof DriverError ? err.message : 'failed' });
      }
    }
    createAuditLog({ userId: req.user?.id, siteId: site_id, action: 'diagnostics.attest_all', details: { count: devices.length } });
    sendSuccess(res, { total: devices.length, results });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/diagnostics/clear-caches — tell every agent in a site to refresh its
 * content cache. Operator+.
 */
router.post('/clear-caches', authUser, requireMinRole('operator'), validateBody(siteSchema), async (req, res, next) => {
  try {
    const { site_id } = req.body as z.infer<typeof siteSchema>;
    checkSiteAccess(req, site_id);
    const devices = await siteDeviceIds(site_id);
    const sentTo = await sendCacheRefreshToDevices(devices.map((d) => d.id), 'diagnostics.clear_caches');
    createAuditLog({ userId: req.user?.id, siteId: site_id, action: 'diagnostics.clear_caches', details: { delivered: sentTo.length } });
    sendSuccess(res, { delivered: sentTo.length, deviceIds: sentTo });
  } catch (err) {
    next(err);
  }
});

export default router;
