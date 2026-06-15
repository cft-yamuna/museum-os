/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';
import { sendSuccess, sendCreated } from '../lib/response.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authUser, requireRole } from '../middleware/auth.js';
import { createAuditLog } from '../services/auditLog.js';
import { sendCommandToAgent } from '../services/agentWs.js';
import { sendCacheRefreshToApps, sendCacheRefreshToDevices } from '../services/appRefresh.js';

const router = Router();

// --- Schemas ---

const TEMPLATE_TYPES = [
  // Catalog apps
  'app01-monophone-audio',
  'app01-monophone-audio-multi',
  'app02-monophone-video',
  'app03-touch-carousel',
  'app04-media-loop',
  'app05-interactive-map',
  'app06-media-browser',
  // Shared / utility
  'proximity',
  'touch-scroll',
  'multi-screen',
  'diagnostics',
  // Custom
  'custom01-hilight-timeline',
  'custom01-wipro-timeline',
  'custom06-reception-program',
  'custom07-osc',
  'custom08-museum-kiosk',
] as const;

const createAppSchema = z.object({
  site_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  template_type: z.enum(TEMPLATE_TYPES),
  config: z.record(z.unknown()).optional(),
});

const updateAppSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
});

const listAppsSchema = z.object({
  site_id: z.string().uuid(),
  include_deleted: z.enum(['true', 'false']).optional(),
});

// --- Helpers ---

function checkSiteAccess(req: Express.Request & { user?: { role: string; site_ids: string[] | null } }, siteId: string): void {
  if (req.user?.role === 'super_admin') return;
  if (!req.user?.site_ids || !req.user.site_ids.includes(siteId)) {
    throw new ForbiddenError('No access to this site');
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function buildAgentConfigPayload(
  appConfig: Record<string, unknown>,
  deviceConfig: Record<string, unknown>
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (appConfig.inputSource !== undefined) payload.inputSource = appConfig.inputSource;
  if (appConfig.oscPort !== undefined) payload.oscPort = appConfig.oscPort;
  if (appConfig.oscAddress !== undefined) payload.oscAddress = appConfig.oscAddress;
  if (appConfig.oscHost !== undefined) payload.oscHost = appConfig.oscHost;

  const rawComPort = deviceConfig.com_port;
  const comPort = typeof rawComPort === 'string' ? rawComPort.trim() : '';
  const rawControllerId = appConfig.controllerId;
  const controllerId = typeof rawControllerId === 'string' && rawControllerId.trim().length > 0
    ? rawControllerId.trim()
    : comPort;

  const rawBaudRate = deviceConfig.baud_rate;
  const parsedBaudRate = typeof rawBaudRate === 'number'
    ? rawBaudRate
    : typeof rawBaudRate === 'string'
      ? Number(rawBaudRate)
      : NaN;
  const baudRate = Number.isFinite(parsedBaudRate) ? parsedBaudRate : undefined;

  if (comPort) {
    payload.com_port = comPort;
    payload.controllerId = controllerId;
    if (baudRate !== undefined) {
      payload.baudRate = baudRate;
    }
  }

  return payload;
}

// --- Routes ---

/**
 * GET /api/apps
 * List apps for a site with assigned device count.
 * Pass ?include_deleted=true to get trashed apps only.
 */
router.get('/', authUser, validateQuery(listAppsSchema), async (req, res, next) => {
  try {
    const { site_id, include_deleted } = req.query as { site_id: string; include_deleted?: string };
    checkSiteAccess(req, site_id);

    const db = getDb();
    let query = db('apps')
      .leftJoin(
        db('devices')
          .select('app_id')
          .count('* as device_count')
          .groupBy('app_id')
          .as('dc'),
        'apps.id',
        'dc.app_id'
      )
      .select(
        'apps.*',
        db.raw('COALESCE(dc.device_count, 0)::int as device_count')
      )
      .where('apps.site_id', site_id);

    if (include_deleted === 'true') {
      // Only trashed apps
      query = query.whereNotNull('apps.deleted_at');
    } else {
      // Only active (non-deleted) apps
      query = query.whereNull('apps.deleted_at').andWhere('apps.is_active', true);
    }

    const apps = await query.orderBy('apps.created_at', 'desc');
    sendSuccess(res, apps);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/apps
 * Create a new app.
 */
router.post(
  '/',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  validateBody(createAppSchema),
  async (req, res, next) => {
    try {
      const { site_id, name, template_type, config } = req.body;
      checkSiteAccess(req, site_id);

      const db = getDb();
      const [app] = await db('apps')
        .insert({
          site_id,
          name,
          template_type,
          config: JSON.stringify(config || {}),
          created_by: req.user?.id || null,
        })
        .returning('*');

      createAuditLog({
        userId: req.user?.id,
        siteId: site_id,
        action: 'app.created',
        entityType: 'app',
        entityId: app.id,
        details: { name, template_type },
      });

      sendCreated(res, app);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/apps/:id
 * Get app detail with device count.
 */
router.get('/:id', authUser, async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const app = await db('apps').where('apps.id', id).whereNull('apps.deleted_at').andWhere('apps.is_active', true).first();

    if (!app) {
      throw new NotFoundError('App', id);
    }

    checkSiteAccess(req, app.site_id);

    const countResult = await db('devices')
      .where({ app_id: id })
      .count('* as count')
      .first();

    sendSuccess(res, {
      ...app,
      device_count: parseInt(String(countResult?.count || '0'), 10),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/apps/:id
 * Update app name/config. Broadcasts config:updated to all assigned devices.
 */
router.put(
  '/:id',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  validateBody(updateAppSchema),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();
      let cacheRefreshRequestId: string | null = null;
      let cacheRefreshDeviceIds: string[] = [];

      const existing = await db('apps').where({ id }).first();
      if (!existing) {
        throw new NotFoundError('App', id);
      }

      checkSiteAccess(req, existing.site_id);

      const updates: Record<string, unknown> = { updated_at: db.fn.now() };

      if (req.body.name !== undefined) {
        updates.name = req.body.name;
      }
      if (req.body.config !== undefined) {
        updates.config = JSON.stringify(req.body.config);
      }
      if (req.body.is_active !== undefined) {
        updates.is_active = req.body.is_active;
      }

      const [updatedApp] = await db('apps')
        .where({ id })
        .update(updates)
        .returning('*');

      // If config changed, push app-related agent config and ask the device agent
      // to stage+activate the new revision before the running display updates.
      if (req.body.config !== undefined) {
        const nextAppConfig = req.body.config as Record<string, unknown>;
        cacheRefreshRequestId = crypto.randomUUID();
        const assignedDevices = await db('devices')
          .where({ app_id: id })
          .select('id', 'config');

        for (const device of assignedDevices as Array<{ id: string; config: unknown }>) {
          const deviceConfig = asRecord(device.config);
          const agentPayload = buildAgentConfigPayload(nextAppConfig, deviceConfig);
          if (Object.keys(agentPayload).length === 0) {
            continue;
          }

          sendCommandToAgent(device.id, {
            type: 'agent:config',
            payload: agentPayload,
            timestamp: Date.now(),
          });
        }

        cacheRefreshDeviceIds = await sendCacheRefreshToApps(
          [id],
          'app-save',
          {
            appId: id,
            requestId: cacheRefreshRequestId,
          }
        );
      }

      createAuditLog({
        userId: req.user?.id,
        siteId: existing.site_id,
        action: 'app.updated',
        entityType: 'app',
        entityId: id,
        details: { changes: req.body },
      });

      sendSuccess(res, {
        ...updatedApp,
        cache_refresh_device_ids: cacheRefreshDeviceIds,
        cache_refresh_request_id: cacheRefreshRequestId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/apps/:id
 * Soft-delete: move to recycle bin (set deleted_at timestamp).
 * App stays for 30 days, then can be permanently removed.
 */
router.delete(
  '/:id',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const existing = await db('apps').where({ id }).whereNull('deleted_at').first();
      if (!existing) {
        throw new NotFoundError('App', id);
      }

      checkSiteAccess(req, existing.site_id);

      const assignedDevices = await db('devices')
        .where({ app_id: id })
        .select('id');
      const assignedDeviceIds = (assignedDevices as Array<{ id: string }>).map((device) => device.id);

      // Unassign devices and clear their active cache so stale content does not linger.
      await db('devices').where({ app_id: id }).update({ app_id: null });
      await sendCacheRefreshToDevices(assignedDeviceIds, 'app-trashed');

      const [updatedApp] = await db('apps')
        .where({ id })
        .update({ is_active: false, deleted_at: db.fn.now(), updated_at: db.fn.now() })
        .returning('*');

      createAuditLog({
        userId: req.user?.id,
        siteId: existing.site_id,
        action: 'app.trashed',
        entityType: 'app',
        entityId: id,
        details: { name: existing.name },
      });

      sendSuccess(res, { message: 'App moved to recycle bin', app: updatedApp });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/apps/:id/restore
 * Restore an app from the recycle bin.
 */
router.post(
  '/:id/restore',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const existing = await db('apps').where({ id }).whereNotNull('deleted_at').first();
      if (!existing) {
        throw new NotFoundError('App', id);
      }

      checkSiteAccess(req, existing.site_id);

      const [restoredApp] = await db('apps')
        .where({ id })
        .update({ is_active: true, deleted_at: null, updated_at: db.fn.now() })
        .returning('*');

      createAuditLog({
        userId: req.user?.id,
        siteId: existing.site_id,
        action: 'app.restored',
        entityType: 'app',
        entityId: id,
        details: { name: existing.name },
      });

      sendSuccess(res, { message: 'App restored', app: restoredApp });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/apps/:id/permanent
 * Permanently delete an app from the recycle bin. Cannot be undone.
 */
router.delete(
  '/:id/permanent',
  authUser,
  requireRole(['super_admin', 'site_admin']),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const existing = await db('apps').where({ id }).whereNotNull('deleted_at').first();
      if (!existing) {
        throw new NotFoundError('App', id);
      }

      checkSiteAccess(req, existing.site_id);

      await db('apps').where({ id }).del();

      createAuditLog({
        userId: req.user?.id,
        siteId: existing.site_id,
        action: 'app.permanently_deleted',
        entityType: 'app',
        entityId: id,
        details: { name: existing.name },
      });

      sendSuccess(res, { message: 'App permanently deleted' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
