/// <reference path="../types/express.d.ts" />
import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../lib/errors.js';
import { sendSuccess, sendCreated, sendError } from '../lib/response.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authUser, authDevice, requireRole } from '../middleware/auth.js';
import { getPJLinkClient } from '../services/pjlink.js';
import { getSSSPClient } from '../services/sssp.js';
import { createAuditLog } from '../services/auditLog.js';
import { sendToDevice } from '../services/displayWs.js';
import { sendCommandToAgent } from '../services/agentWs.js';
import { resolveWakeMac } from '../services/deviceWake.js';
import { sendCacheRefreshToDevices } from '../services/appRefresh.js';
import { cascadePower, getChildren } from '../services/powerCascade.js';
import { pushToAdmins } from '../services/adminWs.js';

const router = Router();

/**
 * Run the power cascade for a device after a power action.
 * Fire-and-forget: only meaningful when the device has child devices.
 */
function cascadeForAction(deviceId: string, action: string): void {
  if (action === 'power_on') {
    void cascadePower(deviceId, true);
  } else if (action === 'power_off') {
    void cascadePower(deviceId, false);
  }
}

// --- IP / Pairing Helpers ---

function normalizeIp(ip: string): string {
  // Remove IPv6 prefix for IPv4-mapped addresses
  if (ip.indexOf('::ffff:') === 0) {
    return ip.substring(7);
  }
  return ip;
}

function generatePairingCode(): string {
  var digits = '';
  for (var i = 0; i < 6; i++) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return digits;
}

import { sendWolPacket } from '../services/wol.js';

async function sendWakeOnLan(macAddress: string): Promise<void> {
  return sendWolPacket(macAddress);
}

// --- Schemas ---

const DEVICE_TYPES = [
  'display',
  'kiosk',
  'projector',
  'audio',
  'lighting',
  'samsung_display',
  'lg_display',
  'windows_pc',
  'raspberry_pi',
  'esp32_mcu',
  'lighting_dali',
] as const;

const createDeviceSchema = z.object({
  mac_address: z.string().optional().transform(v => {
    if (!v) return undefined;
    // Strip all separators, validate 12 hex chars, normalize to XX:XX:XX:XX:XX:XX
    const hex = v.replace(/[:\-.\s]/g, '');
    if (!/^[0-9A-Fa-f]{12}$/.test(hex)) return undefined;
    return hex.match(/.{2}/g)!.join(':').toUpperCase();
  }),
  site_id: z.string().uuid(),
  hostname: z.string().optional(),
  display_name: z.string().optional(),
  slug: z.string().optional(),
  type: z.enum(DEVICE_TYPES),
  capabilities: z.array(z.string()).optional(),
  ip_address: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const updateDeviceSchema = z.object({
  display_name: z.string().optional(),
  floor_id: z.string().uuid().nullable().optional(),
  type: z.enum(DEVICE_TYPES).optional(),
  ip_address: z.string().trim().nullable().optional().transform(v => v === undefined ? undefined : v || null),
  x_position: z.number().int().nullable().optional(),
  y_position: z.number().int().nullable().optional(),
  config: z.record(z.unknown()).optional(),
  status: z.enum(['online', 'offline', 'error', 'unavailable']).optional(),
  app_id: z.string().uuid().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  power_order: z.number().int().nullable().optional(),
});

const powerSchema = z.object({
  action: z.enum(['power_on', 'power_off', 'restart', 'wake']),
});

const simulateSchema = z.object({
  fault: z.enum(['offline', 'temp_high', 'slow', 'clear']),
});

const listDevicesSchema = z.object({
  site_id: z.string().uuid(),
  status: z.string().optional(),
  type: z.string().optional(),
  floor_id: z.string().uuid().optional(),
});

// --- Helpers ---

/**
 * Check that the authenticated user has access to the given site.
 * Super admins always pass; others must have the site in their site_ids.
 */
function checkSiteAccess(req: Express.Request & { user?: { role: string; site_ids: string[] | null } }, siteId: string): void {
  if (req.user?.role === 'super_admin') return;
  if (!req.user?.site_ids || !req.user.site_ids.includes(siteId)) {
    throw new ForbiddenError('No access to this site');
  }
}

function asRevisionToken(value: unknown, fallback: unknown): string {
  const primary = typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : '';
  if (primary) return primary;

  if (fallback instanceof Date) {
    return fallback.toISOString();
  }
  if (typeof fallback === 'string' && fallback.trim().length > 0) {
    return fallback.trim();
  }
  return new Date().toISOString();
}

function deriveHeartbeatFields(device: Record<string, unknown>): Record<string, unknown> {
  let config: Record<string, unknown> = {};
  try {
    config = typeof device.config === 'string'
      ? JSON.parse(device.config)
      : (device.config as Record<string, unknown> || {});
  } catch {
    config = {};
  }

  const hb = (config.lastHeartbeat && typeof config.lastHeartbeat === 'object')
    ? config.lastHeartbeat as Record<string, unknown>
    : null;

  const heartbeatStatus = hb && typeof hb.status === 'string'
    ? hb.status
    : null;

  const heartbeatTimestamp = hb && typeof hb.timestamp === 'number' && Number.isFinite(hb.timestamp)
    ? new Date(hb.timestamp).toISOString()
    : null;

  return {
    ...device,
    heartbeat_status: heartbeatStatus,
    last_heartbeat: heartbeatTimestamp,
  };
}

// --- Routes ---

/**
 * GET /api/devices
 * List devices filtered by site_id (required), with optional status/type/floor_id.
 */
router.get('/', authUser, validateQuery(listDevicesSchema), async (req, res, next) => {
  try {
    const { site_id, status, type, floor_id } = req.query as {
      site_id: string;
      status?: string;
      type?: string;
      floor_id?: string;
    };

    checkSiteAccess(req, site_id);

    const db = getDb();
    let query = db('devices')
      .leftJoin('apps', 'devices.app_id', 'apps.id')
      .select(
        'devices.*',
        'apps.name as app_name',
        'apps.template_type as app_template_type'
      )
      .where('devices.site_id', site_id);

    if (status) {
      query = query.where('devices.status', status);
    }
    if (type) {
      query = query.where('devices.type', type);
    }
    if (floor_id) {
      query = query.where('devices.floor_id', floor_id);
    }

    const devices = await query.orderBy('devices.display_name', 'asc');

    sendSuccess(res, devices.map((d: Record<string, unknown>) => deriveHeartbeatFields(d)));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/devices
 * Register a new device. Generates an API key stored in config.apiKey.
 * The API key is only returned once in the creation response.
 */
router.post('/', authUser, requireRole(['super_admin', 'site_admin']), validateBody(createDeviceSchema), async (req, res, next) => {
  try {
    const { mac_address, site_id, hostname, display_name, slug, type, capabilities, ip_address, config: userConfig } = req.body;

    checkSiteAccess(req, site_id);

    const db = getDb();

    // Generate a unique API key for this device
    const apiKey = crypto.randomBytes(32).toString('hex');

    // Generate slug from display_name if not provided
    const deviceSlug = (slug || (display_name
      ? display_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : undefined))?.toLowerCase();

    try {
      const [device] = await db('devices')
        .insert({
          mac_address: mac_address || `00:00:00:${crypto.randomBytes(3).toString('hex').match(/.{2}/g)!.join(':')}`,
          site_id,
          hostname: hostname || null,
          display_name: display_name || hostname || mac_address || 'Unnamed Device',
          slug: deviceSlug || null,
          type,
          capabilities: capabilities || null,
          ip_address: ip_address || null,
          status: 'offline',
          config: JSON.stringify({ apiKey, ...(userConfig || {}) }),
        })
        .returning('*');

      sendCreated(res, device);
    } catch (err: any) {
      // Handle unique constraint violation on mac_address
      if (err.code === '23505' && err.constraint && err.constraint.includes('mac_address')) {
        throw new ConflictError(`Device with MAC address '${mac_address}' already exists`);
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// ==========================================
// Provisioning endpoints (no auth required)
// ==========================================

/**
 * GET /api/devices/provision/:slug - Auto-provision by IP or return pairing code
 */
router.get('/provision/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const db = getDb();

    const device = await db('devices').whereRaw('LOWER(slug) = LOWER(?)', [slug]).first();
    if (!device) {
      return res.status(404).json({ error: 'Device not found', slug });
    }

    // Check if request IP matches the registered IP.
    // Only auto-provision if this IP is NOT already used by a different device
    // (prevents same-browser/same-IP collisions during testing or multi-device setups).
    const requestIp = req.ip || req.socket.remoteAddress || '';
    const normalizedReqIp = normalizeIp(requestIp);
    const normalizedDeviceIp = device.ip_address ? normalizeIp(device.ip_address) : '';

    if (normalizedDeviceIp && normalizedReqIp === normalizedDeviceIp) {
      // Check no other device shares this IP (same browser/machine scenario)
      const otherWithSameIp = await db('devices')
        .where('ip_address', normalizedReqIp)
        .whereNot('id', device.id)
        .where('site_id', device.site_id)
        .first();

      if (!otherWithSameIp) {
        // IP matches and is unique to this device — safe to auto-provision
        const config = typeof device.config === 'string'
          ? JSON.parse(device.config)
          : device.config || {};
        // Generate API key if missing (e.g. seeded devices)
        if (!config.apiKey) {
          config.apiKey = crypto.randomBytes(32).toString('hex');
          await db('devices').where('id', device.id).update({
            config: JSON.stringify(config),
          });
        }
        return res.json({
          deviceId: device.id,
          apiKey: config.apiKey,
        });
      }
      // IP matches but is shared — fall through to pairing to avoid wrong device
    }

    // IP doesn't match - reuse existing valid code or generate a new one
    let code: string;
    if (
      device.pairing_code &&
      device.pairing_code_expires &&
      new Date(device.pairing_code_expires) > new Date()
    ) {
      // Existing code is still valid — reuse it so the admin UI stays in sync
      code = device.pairing_code;
    } else {
      code = generatePairingCode();
      const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      await db('devices')
        .where('id', device.id)
        .update({
          pairing_code: code,
          pairing_code_expires: expires,
        });
    }

    return res.json({
      requiresPairing: true,
      code,
    });
  } catch (error) {
    console.error('[Provision] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/devices/provision/:slug/status - Poll for pairing completion
 */
router.get('/provision/:slug/status', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { code } = req.query;
    const db = getDb();

    if (!code) {
      return res.status(400).json({ error: 'Missing code parameter' });
    }

    const device = await db('devices').whereRaw('LOWER(slug) = LOWER(?)', [slug]).first();
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Check if pairing was completed (code cleared means admin confirmed)
    if (!device.pairing_code) {
      // Admin confirmed pairing — register the display's IP and return credentials
      const requestIp = req.ip || req.socket.remoteAddress || '';
      const normalizedReqIp = normalizeIp(requestIp);

      const config = typeof device.config === 'string'
        ? JSON.parse(device.config)
        : device.config || {};
      // Generate API key if missing (e.g. seeded devices)
      if (!config.apiKey) {
        config.apiKey = crypto.randomBytes(32).toString('hex');
      }

      // Update device IP and ensure config has API key
      await db('devices')
        .where('id', device.id)
        .update({
          ip_address: normalizedReqIp,
          config: JSON.stringify(config),
        });

      return res.json({
        deviceId: device.id,
        apiKey: config.apiKey,
      });
    }

    // Still waiting for admin to confirm
    return res.json({ paired: false });
  } catch (error) {
    console.error('[Provision] Status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/devices/provision/:slug/pair - Admin pairs a device (called from admin UI)
 */
router.post('/provision/:slug/pair', authUser, async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { ip_address } = req.body;
    const db = getDb();

    const device = await db('devices').whereRaw('LOWER(slug) = LOWER(?)', [slug]).first();
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Require that an agent is actively waiting for pairing
    if (!device.pairing_code) {
      return res.status(400).json({ error: 'No pending pairing request for this device' });
    }

    // Pair the device - clear code so the agent's next status poll returns credentials
    const updateData: Record<string, unknown> = {
      pairing_code: null,
      pairing_code_expires: null,
    };
    if (ip_address) {
      updateData.ip_address = ip_address;
    }

    await db('devices').where('id', device.id).update(updateData);

    return res.json({ success: true, deviceId: device.id });
  } catch (error) {
    console.error('[Provision] Pair error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/devices/:id
 * Get full device details, including floor name via LEFT JOIN.
 */
router.get('/:id', authUser, async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const device = await db('devices')
      .leftJoin('floors', 'devices.floor_id', 'floors.id')
      .leftJoin('apps', 'devices.app_id', 'apps.id')
      .select(
        'devices.*',
        'floors.name as floor_name',
        'apps.name as app_name',
        'apps.template_type as app_template_type'
      )
      .where('devices.id', id)
      .first();

    if (!device) {
      throw new NotFoundError('Device', id);
    }

    checkSiteAccess(req, device.site_id);

    // Power topology: include direct children and the parent (if any) so the
    // admin can render the cascade tree on the device detail page.
    const children = await getChildren(db, id);
    let parent: Record<string, unknown> | null = null;
    if (device.parent_id) {
      parent = await db('devices')
        .where('id', device.parent_id)
        .select('id', 'display_name', 'status', 'type')
        .first() || null;
    }

    sendSuccess(res, { ...deriveHeartbeatFields(device), children, parent });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/devices/:id
 * Update device fields (display_name, floor_id, type, ip_address, position, config, status).
 */
router.put('/:id', authUser, requireRole(['super_admin', 'site_admin']), validateBody(updateDeviceSchema), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    // Verify device exists and check site access
    const existingDevice = await db('devices').where({ id }).first();
    if (!existingDevice) {
      throw new NotFoundError('Device', id);
    }

    checkSiteAccess(req, existingDevice.site_id);

    // Build update object from validated body
    const updates: Record<string, any> = {};

    if (req.body.display_name !== undefined) {
      updates.display_name = req.body.display_name;
    }
    if (req.body.floor_id !== undefined) {
      updates.floor_id = req.body.floor_id;
    }
    if (req.body.type !== undefined) {
      updates.type = req.body.type;
    }
    if (req.body.ip_address !== undefined) {
      updates.ip_address = req.body.ip_address;
    }
    if (req.body.x_position !== undefined) {
      updates.x_position = req.body.x_position;
    }
    if (req.body.y_position !== undefined) {
      updates.y_position = req.body.y_position;
    }
    if (req.body.status !== undefined) {
      updates.status = req.body.status;
    }
    if (req.body.parent_id !== undefined) {
      if (req.body.parent_id === id) {
        throw new ConflictError('A device cannot be its own power parent');
      }
      updates.parent_id = req.body.parent_id;
    }
    if (req.body.power_order !== undefined) {
      updates.power_order = req.body.power_order;
    }

    // Merge config with existing JSONB (preserves apiKey and other fields)
    if (req.body.config !== undefined) {
      updates.config = db.raw("coalesce(config, '{}'::jsonb) || ?::jsonb", [JSON.stringify(req.body.config)]);
    }

    // Handle app_id assignment
    if (req.body.app_id !== undefined) {
      updates.app_id = req.body.app_id;
    }

    updates.updated_at = db.fn.now();

    const [updatedDevice] = await db('devices')
      .where({ id })
      .update(updates)
      .returning('*');

    // If app_id changed, navigate device to new app URL
    if (req.body.app_id !== undefined && req.body.app_id !== existingDevice.app_id) {
      if (req.body.app_id) {
        const newApp = await db('apps').where({ id: req.body.app_id }).first();
        if (newApp) {
          const appUrl = `/apps/${newApp.template_type}/${newApp.id}`;
          sendToDevice(id, {
            type: 'command:navigate',
            payload: { url: appUrl },
            timestamp: Date.now(),
          });
        }
        await sendCacheRefreshToDevices([id], 'device-app-reassigned');
      } else {
        // Unassigned — send to idle
        sendToDevice(id, {
          type: 'command:idle',
          payload: { action: 'unassigned' },
          timestamp: Date.now(),
        });
        await sendCacheRefreshToDevices([id], 'device-app-unassigned');
      }

      createAuditLog({
        userId: req.user?.id,
        siteId: existingDevice.site_id,
        action: 'device.app_changed',
        entityType: 'device',
        entityId: id,
        details: { old_app_id: existingDevice.app_id, new_app_id: req.body.app_id },
      });
    }

    // If com_port changed, push to agent immediately so it starts/restarts the serial bridge
    if (req.body.config !== undefined && req.body.config.com_port !== undefined) {
      const newComPort = req.body.config.com_port as string | null;
      const sent = sendCommandToAgent(id, {
        type: 'agent:config',
        payload: { com_port: newComPort || '' },
        timestamp: Date.now(),
      });
      console.log(`[Devices] com_port update for ${id}: "${newComPort}" — agent push ${sent ? 'sent' : 'agent offline'}`);
    }

    // If orientation changed, push to agent so it rotates the display
    if (req.body.config !== undefined && req.body.config.orientation !== undefined) {
      const orientation = req.body.config.orientation as string;
      const sent = sendCommandToAgent(id, {
        type: 'agent:config',
        payload: { orientation },
        timestamp: Date.now(),
      });
      console.log(`[Devices] orientation update for ${id}: "${orientation}" — agent push ${sent ? 'sent' : 'agent offline'}`);
    }

    // If screenMap changed, push to agent so it launches/relaunches Chrome on mapped screens
    if (req.body.config !== undefined && req.body.config.screenMap !== undefined) {
      const screenMap = req.body.config.screenMap as Array<{ hardwareId: string; url: string }>;
      let totalScreens = Array.isArray(screenMap) ? screenMap.length : 0;

      // Prefer totalScreens from assigned app config when available.
      const effectiveAppId = req.body.app_id !== undefined
        ? req.body.app_id
        : existingDevice.app_id;
      if (effectiveAppId) {
        const linkedApp = await db('apps')
          .select('config')
          .where({ id: effectiveAppId })
          .first();
        const appConfig = typeof linkedApp?.config === 'string'
          ? JSON.parse(linkedApp.config)
          : (linkedApp?.config || {});
        const appScreens = Array.isArray(appConfig.screens) ? appConfig.screens : [];
        const appTotal = appScreens.length > 0
          ? appScreens.length
          : Number(appConfig.totalScreens || 0);
        if (Number.isFinite(appTotal) && appTotal > 0) {
          totalScreens = Math.max(totalScreens, Math.floor(appTotal));
        }
      }

      const sent = sendCommandToAgent(id, {
        type: 'agent:screenMap',
        payload: { screenMap, totalScreens },
        timestamp: Date.now(),
      });
      console.log(
        `[Devices] screenMap update for ${id}: ${screenMap.length} mapping(s), totalScreens=${totalScreens} — agent push ${sent ? 'sent' : 'agent offline'}`
      );

      await sendCacheRefreshToDevices([id], 'device-screenmap-updated');
    }

    // Notify display app of config change via WebSocket (legacy config path)
    if (req.body.config !== undefined) {
      const deviceConfig = updatedDevice.config || {};
      const oldAppUrl = (existingDevice.config || {}).appUrl;
      const newAppUrl = deviceConfig.appUrl;

      if (newAppUrl && newAppUrl !== oldAppUrl) {
        sendToDevice(id, {
          type: 'command:navigate',
          payload: { url: newAppUrl },
          timestamp: Date.now(),
        });
      } else {
        sendToDevice(id, {
          type: 'config:updated',
          payload: { config: deviceConfig.appConfig || {} },
          timestamp: Date.now(),
        });
      }

      createAuditLog({
        userId: req.user?.id,
        siteId: existingDevice.site_id,
        action: 'device.config_updated',
        entityType: 'device',
        entityId: id,
        details: { config: req.body.config },
      });
    }

    sendSuccess(res, updatedDevice);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/devices/:id
 * Hard delete a device (CASCADE removes group memberships).
 * Super admin only.
 */
router.delete('/:id', authUser, requireRole(['super_admin', 'site_admin']), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const existingDevice = await db('devices').where({ id }).first();
    if (!existingDevice) {
      throw new NotFoundError('Device', id);
    }

    await db('devices').where({ id }).del();

    sendSuccess(res, { message: 'Device deleted successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/devices/:id/config
 * Returns the device config shaped for the App01 display client.
 * Uses API key auth (authDevice), not JWT.
 */
router.get('/:id/config', authDevice, async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    // Verify the authenticated device matches the requested id
    if (req.device?.id !== id) {
      throw new ForbiddenError('Device can only access its own config');
    }

    const device = await db('devices')
      .leftJoin('apps', 'devices.app_id', 'apps.id')
      .select(
        'devices.*',
        'apps.id as linked_app_id',
        'apps.template_type as app_template_type',
        'apps.config as app_config',
        'apps.updated_at as app_updated_at',
        db.raw(`to_char(apps.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as app_updated_at_token`),
        db.raw(`to_char(devices.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as device_updated_at_token`)
      )
      .where('devices.id', id)
      .first();

    if (!device) {
      throw new NotFoundError('Device', id);
    }

    const config = device.config || {};

    // Build assignedApp from the linked apps table (preferred) or legacy config
    let assignedApp: Record<string, unknown> | null = null;
    if (device.linked_app_id) {
      const appConfig = typeof device.app_config === 'string'
        ? JSON.parse(device.app_config)
        : device.app_config || {};

      // If the device has a screenIndex in its own config, override the app-level one.
      // This lets the admin assign which screen this device is from the device detail page.
      if (config.screenIndex !== undefined && config.screenIndex !== null) {
        appConfig.screenIndex = config.screenIndex;
      }

      assignedApp = {
        appId: device.linked_app_id,
        templateType: device.app_template_type,
        instanceId: device.linked_app_id,
        revision: `${device.linked_app_id}:${asRevisionToken(device.app_updated_at_token, device.app_updated_at || device.updated_at)}`,
        updatedAt: device.app_updated_at || null,
        url: `/apps/${device.app_template_type}/${device.linked_app_id}`,
        config: appConfig,
      };
    } else if (config.templateType || config.instanceId || config.appUrl || config.appConfig) {
      // Legacy fallback
      assignedApp = {
        templateType: config.templateType || null,
        instanceId: config.instanceId || null,
        revision: `${config.instanceId || 'legacy'}:${asRevisionToken(device.device_updated_at_token, device.updated_at)}`,
        updatedAt: device.updated_at || null,
        url: config.appUrl || null,
        config: config.appConfig || {},
      };
    }

    const payload = {
      device: {
        id: device.id,
        name: device.display_name,
        apiKey: config.apiKey || null,
        com_port: config.com_port || null,
        baud_rate: config.baud_rate || null,
        screenMap: config.screenMap || [],
        detectedScreens: config.detectedScreens || [],
        orientation: config.orientation || 'landscape',
      },
      assignedApp,
    };

    sendSuccess(res, payload);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/devices/:id/power
 * Send a power command to a device.
 * Updates device status; actual WebSocket dispatch added in Phase 9.
 */
router.post('/:id/power', authUser, requireRole(['super_admin', 'site_admin', 'operator']), validateBody(powerSchema), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const existingDevice = await db('devices').where({ id }).first();
    if (!existingDevice) {
      throw new NotFoundError('Device', id);
    }

    checkSiteAccess(req, existingDevice.site_id);

    const { action } = req.body as { action: 'power_on' | 'power_off' | 'restart' | 'wake' };
    console.log(`[Power] Device ${existingDevice.display_name} (${id}) - action: ${action}`);

    // --- Wake-on-LAN: send on power_on or wake if device has a MAC ---
    const wakeTarget = resolveWakeMac(existingDevice);
    if ((action === 'power_on' || action === 'wake') && wakeTarget.mac) {
      console.log(`[Power] Sending WOL packet for ${existingDevice.display_name} (${wakeTarget.mac}, source=${wakeTarget.source})`);
      await sendWakeOnLan(wakeTarget.mac);

      createAuditLog({
        userId: req.user?.id,
        siteId: existingDevice.site_id,
        action: 'device.wake',
        entityType: 'device',
        entityId: id,
        details: { mac_address: wakeTarget.mac, source: wakeTarget.source },
      });

      if (action === 'wake') {
        sendSuccess(res, {
          message: 'Wake-on-LAN packet sent',
          device_id: id,
          action,
          mac_address: wakeTarget.mac,
          source: wakeTarget.source,
        });
        return;
      }
      // For power_on, continue to also send WebSocket/agent command
    } else if (action === 'wake') {
      sendError(res, 400, 'No usable MAC address found for Wake-on-LAN. Bring the device online once so the agent can report its wired MAC.', 'WOL_MAC_UNAVAILABLE');
      return;
    }

    // --- PJLink projector handling ---
    if (existingDevice.type === 'projector') {
      const config = typeof existingDevice.config === 'string'
        ? JSON.parse(existingDevice.config)
        : existingDevice.config || {};
      const pjlinkClient = getPJLinkClient(config);

      if (!pjlinkClient) {
        sendError(res, 400, 'Projector has no PJLink host configured', 'PJLINK_NOT_CONFIGURED');
        return;
      }

      let result;
      if (action === 'power_on') {
        result = await pjlinkClient.powerOn();
      } else if (action === 'power_off') {
        result = await pjlinkClient.powerOff();
      } else {
        // restart: power off then on (projector will warm up)
        const offResult = await pjlinkClient.powerOff();
        if (!offResult.success) {
          sendError(res, 502, `PJLink power_off failed: ${offResult.error}`, 'PJLINK_ERROR');
          return;
        }
        result = { success: true, data: 'Restart initiated (power off sent)' };
      }

      if (!result.success) {
        sendError(res, 502, `PJLink command failed: ${result.error}`, 'PJLINK_ERROR');
        return;
      }

      // Update device status
      const updates: Record<string, any> = { updated_at: db.fn.now() };
      if (action === 'power_off') {
        updates.status = 'offline';
      }
      await db('devices').where({ id }).update(updates);

      createAuditLog({
        userId: req.user?.id,
        siteId: existingDevice.site_id,
        action: `projector.${action}`,
        entityType: 'device',
        entityId: id,
        details: { pjlink_result: result.data },
      });

      cascadeForAction(id, action);

      sendSuccess(res, {
        message: `PJLink '${action}' sent to projector`,
        device_id: id,
        action,
        pjlink_result: result.data,
      });
      return;
    }

    // --- Samsung SSSP display handling ---
    if (existingDevice.type === 'samsung_display') {
      const config = typeof existingDevice.config === 'string'
        ? JSON.parse(existingDevice.config)
        : existingDevice.config || {};
      const ssspClient = getSSSPClient(config);

      if (!ssspClient) {
        sendError(res, 400, 'Samsung display has no SSSP host configured', 'SSSP_NOT_CONFIGURED');
        return;
      }

      let result;
      if (action === 'power_on') {
        result = await ssspClient.powerOn();
      } else if (action === 'power_off') {
        result = await ssspClient.powerOff();
      } else {
        result = await ssspClient.restart();
      }

      if (!result.success) {
        sendError(res, 502, `SSSP command failed: ${result.error}`, 'SSSP_ERROR');
        return;
      }

      const updates: Record<string, any> = { updated_at: db.fn.now() };
      if (action === 'power_off') {
        updates.status = 'offline';
      }
      await db('devices').where({ id }).update(updates);

      createAuditLog({
        userId: req.user?.id,
        siteId: existingDevice.site_id,
        action: `samsung.${action}`,
        entityType: 'device',
        entityId: id,
        details: { method: 'sssp' },
      });

      cascadeForAction(id, action);

      sendSuccess(res, {
        message: `SSSP '${action}' sent to Samsung display`,
        device_id: id,
        action,
        method: 'sssp',
      });
      return;
    }

    // --- Agent-based power handling ---
    if (existingDevice.agent_connected && (action === 'power_off' || action === 'restart')) {
      const agentCmd = action === 'power_off' ? 'system:shutdown' : 'system:reboot';

      // Import sendCommandToAgent dynamically to avoid circular deps
      const { sendCommandToAgent } = await import('../services/agentWs.js');

      const commandId = crypto.randomUUID();
      const delivered = sendCommandToAgent(id, {
        type: 'command',
        payload: { id: commandId, command: agentCmd },
        timestamp: Date.now(),
      });

      // Update device status
      const statusUpdates: Record<string, any> = { updated_at: db.fn.now() };
      if (action === 'power_off') {
        statusUpdates.status = 'offline';
      } else if (action === 'restart') {
        statusUpdates.status = 'restarting';
      }
      await db('devices').where({ id }).update(statusUpdates);

      createAuditLog({
        userId: req.user?.id,
        siteId: existingDevice.site_id,
        action: `device.${action}`,
        entityType: 'device',
        entityId: id,
        details: { method: 'agent', commandId, delivered },
      });

      cascadeForAction(id, action);

      sendSuccess(res, {
        message: `Power command '${action}' sent to agent`,
        device_id: id,
        action,
        method: 'agent',
        commandId,
        delivered,
      });
      return;
    }

    // --- Default device handling (WebSocket-based) ---
    const updates: Record<string, any> = {
      updated_at: db.fn.now(),
    };

    if (action === 'power_off') {
      updates.status = 'offline';
    } else if (action === 'restart') {
      updates.status = 'restarting';
    }

    if (Object.keys(updates).length > 1) {
      await db('devices').where({ id }).update(updates);
    }

    // Dispatch WebSocket command to the device
    const wsCommand = action === 'power_on' ? 'command:activate'
      : action === 'power_off' ? 'command:idle'
      : 'command:reload';

    const delivered = sendToDevice(id, {
      type: wsCommand,
      payload: { action },
      timestamp: Date.now(),
    });

    createAuditLog({
      userId: req.user?.id,
      siteId: existingDevice.site_id,
      action: `device.${action}`,
      entityType: 'device',
      entityId: id,
      details: { delivered },
    });

    cascadeForAction(id, action);

    sendSuccess(res, {
      message: `Power command '${action}' sent to device`,
      device_id: id,
      action,
      delivered,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/devices/:id/wake
 * Send a Wake-on-LAN magic packet to wake a device.
 * Requires admin role. Reads MAC from the device's latest health snapshot.
 */
router.post(
  '/:id/wake',
  authUser,
  requireRole(['super_admin', 'site_admin']),
  async (req: Request, res: Response, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const device = await db('devices').where({ id }).first();
      if (!device) {
        throw new NotFoundError('Device', id);
      }

      const wakeTarget = resolveWakeMac(device);
      if (!wakeTarget.mac) {
        return sendError(res, 400, 'No usable MAC address found for device. Bring it online once so the agent can report its wired MAC.');
      }

      // Send WOL packet
      const { sendWolPacket } = await import('../services/wol.js');
      await sendWolPacket(wakeTarget.mac);

      createAuditLog({
        siteId: device.site_id,
        userId: req.user!.id,
        action: 'device.wake',
        entityType: 'device',
        entityId: id,
        details: { mac: wakeTarget.mac, source: wakeTarget.source },
      });

      sendSuccess(res, {
        message: `Wake-on-LAN packet sent to ${device.display_name || device.mac_address || id}`,
        mac: wakeTarget.mac,
        source: wakeTarget.source,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/devices/:id/simulate
 * Lightweight fault injection for demoing / testing cascade, alerts and analytics
 * without real hardware. Marks the device with a simulated fault and (for health
 * faults) writes a synthetic device_health row plus an alert. `clear` restores it.
 */
router.post(
  '/:id/simulate',
  authUser,
  requireRole(['super_admin', 'site_admin']),
  validateBody(simulateSchema),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const device = await db('devices').where({ id }).first();
      if (!device) {
        throw new NotFoundError('Device', id);
      }
      checkSiteAccess(req, device.site_id);

      const { fault } = req.body as { fault: 'offline' | 'temp_high' | 'slow' | 'clear' };

      const setSimFault = (value: string | null) =>
        db.raw("coalesce(config, '{}'::jsonb) || ?::jsonb", [
          JSON.stringify({ sim_fault: value }),
        ]);

      let message = '';

      if (fault === 'clear') {
        await db('devices').where({ id }).update({
          status: 'online',
          config: setSimFault(null),
          updated_at: db.fn.now(),
        });
        void cascadePower(id, true);
        message = 'Simulated fault cleared';
      } else if (fault === 'offline') {
        await db('devices').where({ id }).update({
          status: 'offline',
          config: setSimFault('offline'),
          updated_at: db.fn.now(),
        });
        void cascadePower(id, false);
        message = 'Device marked offline (simulated)';
      } else {
        // temp_high / slow: keep device online but inject a bad health sample + alert.
        const lastHealth =
          typeof device.last_health === 'string'
            ? JSON.parse(device.last_health || '{}')
            : device.last_health || {};

        const isTemp = fault === 'temp_high';
        await db('device_health').insert({
          device_id: id,
          cpu_usage: isTemp ? Number(lastHealth.cpuUsage) || 45 : 98,
          mem_percent: isTemp ? Number(lastHealth.memPercent) || 55 : 95,
          disk_percent: Number(lastHealth.diskPercent) || 60,
          cpu_temp: isTemp ? 86 : Number(lastHealth.cpuTemp) || 60,
          uptime: Number(lastHealth.uptime) || 0,
        });

        await db('alerts').insert({
          site_id: device.site_id,
          device_id: id,
          type: isTemp ? 'device_temp_high' : 'device_slow',
          severity: isTemp ? 'high' : 'medium',
          message: isTemp
            ? `${device.display_name || id}: temperature high (simulated)`
            : `${device.display_name || id}: high CPU/memory load (simulated)`,
        });

        await db('devices').where({ id }).update({
          config: setSimFault(fault),
          updated_at: db.fn.now(),
        });
        message = isTemp ? 'High-temperature fault injected' : 'High-load fault injected';
      }

      createAuditLog({
        userId: req.user?.id,
        siteId: device.site_id,
        action: 'device.simulate_fault',
        entityType: 'device',
        entityId: id,
        details: { fault },
      });

      pushToAdmins(
        {
          type: 'device:simulate',
          payload: { deviceId: id, fault },
          timestamp: Date.now(),
        },
        device.site_id
      );

      sendSuccess(res, { message, device_id: id, fault });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
