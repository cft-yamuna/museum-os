/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';
import { sendSuccess } from '../lib/response.js';
import { validateBody } from '../middleware/validate.js';
import { authUser, requireRole } from '../middleware/auth.js';
import { getDALIClient } from '../services/dali.js';
import { createAuditLog } from '../services/auditLog.js';

const router = Router();

// Check site access helper (same pattern as other routes)
function checkSiteAccess(req: Express.Request & { user?: { role: string; site_ids: string[] | null } }, siteId: string): void {
  if (req.user?.role === 'super_admin') return;
  if (!req.user?.site_ids || !req.user.site_ids.includes(siteId)) {
    throw new ForbiddenError('No access to this site');
  }
}

const sceneSchema = z.object({
  group: z.number().int().min(0).max(15),
  scene: z.number().int().min(0).max(15),
});

const dimSchema = z.object({
  address: z.number().int().min(0),
  level: z.number().min(0).max(100),
});

const colorTempSchema = z.object({
  address: z.number().int().min(0),
  kelvin: z.number().min(2700).max(6500),
});

/**
 * POST /api/lighting/:deviceId/scene
 * Activate a DALI lighting scene.
 */
router.post(
  '/:deviceId/scene',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  validateBody(sceneSchema),
  async (req, res, next) => {
    try {
      const deviceId = Array.isArray(req.params.deviceId)
        ? req.params.deviceId[0]
        : req.params.deviceId;
      const db = getDb();

      const device = await db('devices').where({ id: deviceId }).first();
      if (!device) throw new NotFoundError('Device', deviceId);
      checkSiteAccess(req, device.site_id);

      const config = typeof device.config === 'string' ? JSON.parse(device.config) : device.config || {};
      const client = getDALIClient(deviceId, config);
      if (!client) {
        sendSuccess(res, { success: false, error: 'DALI not configured for this device' });
        return;
      }

      const { group, scene } = req.body;
      const result = await client.activateScene(group, scene);

      createAuditLog({
        siteId: device.site_id,
        userId: req.user!.id,
        action: 'lighting.scene',
        entityType: 'device',
        entityId: deviceId,
        details: { group, scene, result: result.success },
      });

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/lighting/:deviceId/dim
 * Set dimming level.
 */
router.post(
  '/:deviceId/dim',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  validateBody(dimSchema),
  async (req, res, next) => {
    try {
      const deviceId = Array.isArray(req.params.deviceId)
        ? req.params.deviceId[0]
        : req.params.deviceId;
      const db = getDb();

      const device = await db('devices').where({ id: deviceId }).first();
      if (!device) throw new NotFoundError('Device', deviceId);
      checkSiteAccess(req, device.site_id);

      const config = typeof device.config === 'string' ? JSON.parse(device.config) : device.config || {};
      const client = getDALIClient(deviceId, config);
      if (!client) {
        sendSuccess(res, { success: false, error: 'DALI not configured' });
        return;
      }

      const { address, level } = req.body;
      const result = await client.setDimLevel(address, level);

      createAuditLog({
        siteId: device.site_id,
        userId: req.user!.id,
        action: 'lighting.dim',
        entityType: 'device',
        entityId: deviceId,
        details: { address, level, result: result.success },
      });

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/lighting/:deviceId/color-temp
 * Set color temperature.
 */
router.post(
  '/:deviceId/color-temp',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  validateBody(colorTempSchema),
  async (req, res, next) => {
    try {
      const deviceId = Array.isArray(req.params.deviceId)
        ? req.params.deviceId[0]
        : req.params.deviceId;
      const db = getDb();

      const device = await db('devices').where({ id: deviceId }).first();
      if (!device) throw new NotFoundError('Device', deviceId);
      checkSiteAccess(req, device.site_id);

      const config = typeof device.config === 'string' ? JSON.parse(device.config) : device.config || {};
      const client = getDALIClient(deviceId, config);
      if (!client) {
        sendSuccess(res, { success: false, error: 'DALI not configured' });
        return;
      }

      const { address, kelvin } = req.body;
      const result = await client.setColorTemp(address, kelvin);

      createAuditLog({
        siteId: device.site_id,
        userId: req.user!.id,
        action: 'lighting.color_temp',
        entityType: 'device',
        entityId: deviceId,
        details: { address, kelvin, result: result.success },
      });

      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
