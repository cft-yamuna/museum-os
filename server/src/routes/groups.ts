/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { sendSuccess, sendCreated } from '../lib/response.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authUser, requireRole } from '../middleware/auth.js';
import { broadcastToDevices } from '../services/displayWs.js';
import { resolveWakeMac } from '../services/deviceWake.js';
import { sendWolPacket } from '../services/wol.js';

const router = Router();

// --- Schemas ---

const listGroupsSchema = z.object({
  site_id: z.string().uuid(),
  type: z.enum(['zone', 'functional', 'custom']).optional(),
});

const createGroupSchema = z.object({
  site_id: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(['zone', 'functional', 'custom']),
  description: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  config: z.record(z.unknown()).optional(),
});

const updateGroupSchema = createGroupSchema.omit({ site_id: true }).partial();

const addMembersSchema = z.object({
  device_ids: z.array(z.string().uuid()).min(1),
});

const groupActionSchema = z.object({
  action: z.enum(['power_on', 'power_off', 'restart', 'push_content']),
  payload: z.record(z.unknown()).optional(),
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

// --- Routes ---

/**
 * GET /api/groups
 * List groups filtered by site_id (required), with optional type filter.
 * Includes member_count via subquery.
 */
router.get('/', authUser, validateQuery(listGroupsSchema), async (req, res, next) => {
  try {
    const { site_id, type } = req.query as {
      site_id: string;
      type?: string;
    };

    checkSiteAccess(req, site_id);

    const db = getDb();
    let query = db('device_groups')
      .select(
        'device_groups.*',
        db.raw(
          '(SELECT COUNT(*) FROM device_group_members WHERE device_group_members.group_id = device_groups.id)::int AS member_count'
        )
      )
      .where({ site_id });

    if (type) {
      query = query.where({ type });
    }

    const groups = await query.orderBy('name', 'asc');

    sendSuccess(res, groups);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/groups
 * Create a new device group.
 */
router.post('/', authUser, requireRole(['super_admin', 'site_admin']), validateBody(createGroupSchema), async (req, res, next) => {
  try {
    const { site_id, name, type, description, color, config } = req.body;

    checkSiteAccess(req, site_id);

    const db = getDb();

    const [group] = await db('device_groups')
      .insert({
        site_id,
        name,
        type,
        description: description || null,
        color: color || null,
        config: config ? JSON.stringify(config) : null,
      })
      .returning('*');

    sendCreated(res, group);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/groups/:id
 * Get a single group with its member devices.
 */
router.get('/:id', authUser, async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const group = await db('device_groups').where({ id }).first();

    if (!group) {
      throw new NotFoundError('Group', id);
    }

    checkSiteAccess(req, group.site_id);

    // Fetch member devices via JOIN
    const members = await db('device_group_members')
      .join('devices', 'device_group_members.device_id', 'devices.id')
      .select(
        'devices.id',
        'devices.display_name',
        'devices.mac_address',
        'devices.type',
        'devices.status'
      )
      .where('device_group_members.group_id', id)
      .orderBy('devices.display_name', 'asc');

    sendSuccess(res, { ...group, members });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/groups/:id
 * Update a device group (name, type, description, color, config).
 */
router.put('/:id', authUser, requireRole(['super_admin', 'site_admin']), validateBody(updateGroupSchema), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const existingGroup = await db('device_groups').where({ id }).first();
    if (!existingGroup) {
      throw new NotFoundError('Group', id);
    }

    checkSiteAccess(req, existingGroup.site_id);

    // Build update object from validated body
    const updates: Record<string, any> = {};

    if (req.body.name !== undefined) {
      updates.name = req.body.name;
    }
    if (req.body.type !== undefined) {
      updates.type = req.body.type;
    }
    if (req.body.description !== undefined) {
      updates.description = req.body.description;
    }
    if (req.body.color !== undefined) {
      updates.color = req.body.color;
    }
    if (req.body.config !== undefined) {
      updates.config = JSON.stringify(req.body.config);
    }

    const [updatedGroup] = await db('device_groups')
      .where({ id })
      .update(updates)
      .returning('*');

    sendSuccess(res, updatedGroup);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/groups/:id
 * Hard delete a group (CASCADE removes memberships).
 * Super admin only.
 */
router.delete('/:id', authUser, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const existingGroup = await db('device_groups').where({ id }).first();
    if (!existingGroup) {
      throw new NotFoundError('Group', id);
    }

    await db('device_groups').where({ id }).del();

    sendSuccess(res, { message: 'Group deleted successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/groups/:id/members
 * Add devices to a group.
 * Verifies all devices exist and belong to the same site as the group.
 * Uses ON CONFLICT DO NOTHING to handle duplicates.
 */
router.post('/:id/members', authUser, requireRole(['super_admin', 'site_admin']), validateBody(addMembersSchema), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { device_ids } = req.body as { device_ids: string[] };
    const db = getDb();

    // Verify group exists
    const group = await db('device_groups').where({ id }).first();
    if (!group) {
      throw new NotFoundError('Group', id);
    }

    checkSiteAccess(req, group.site_id);

    // Verify all devices exist and belong to the same site
    const devices = await db('devices')
      .whereIn('id', device_ids)
      .select('id', 'site_id');

    if (devices.length !== device_ids.length) {
      const foundIds = devices.map((d: { id: string }) => d.id);
      const missingIds = device_ids.filter((did) => !foundIds.includes(did));
      throw new ValidationError(`Devices not found: ${missingIds.join(', ')}`);
    }

    const wrongSite = devices.filter((d: { site_id: string }) => d.site_id !== group.site_id);
    if (wrongSite.length > 0) {
      throw new ValidationError('All devices must belong to the same site as the group');
    }

    // Insert memberships, ignoring duplicates
    const rows = device_ids.map((device_id) => ({
      group_id: id,
      device_id,
    }));

    await db('device_group_members')
      .insert(rows)
      .onConflict(['group_id', 'device_id'])
      .ignore();

    // Return updated member list
    const members = await db('device_group_members')
      .join('devices', 'device_group_members.device_id', 'devices.id')
      .select(
        'devices.id',
        'devices.display_name',
        'devices.mac_address',
        'devices.type',
        'devices.status'
      )
      .where('device_group_members.group_id', id)
      .orderBy('devices.display_name', 'asc');

    sendSuccess(res, members);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/groups/:id/members/:deviceId
 * Remove a device from a group.
 */
router.delete('/:id/members/:deviceId', authUser, requireRole(['super_admin', 'site_admin']), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const deviceId = Array.isArray(req.params.deviceId) ? req.params.deviceId[0] : req.params.deviceId;
    const db = getDb();

    // Verify group exists and check site access
    const group = await db('device_groups').where({ id }).first();
    if (!group) {
      throw new NotFoundError('Group', id);
    }

    checkSiteAccess(req, group.site_id);

    // Delete membership
    const deleted = await db('device_group_members')
      .where({ group_id: id, device_id: deviceId })
      .del();

    if (deleted === 0) {
      throw new NotFoundError('Membership', `group=${id}, device=${deviceId}`);
    }

    sendSuccess(res, { message: 'Device removed from group' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/groups/:id/actions
 * Execute a bulk action on all devices in a group.
 * For power actions: updates device status (same logic as devices power route).
 * For push_content: returns success (WebSocket dispatch in Phase 9).
 */
router.post('/:id/actions', authUser, requireRole(['super_admin', 'site_admin', 'operator']), validateBody(groupActionSchema), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { action } = req.body as { action: 'power_on' | 'power_off' | 'restart' | 'push_content' };
    const db = getDb();

    // Verify group exists
    const group = await db('device_groups').where({ id }).first();
    if (!group) {
      throw new NotFoundError('Group', id);
    }

    checkSiteAccess(req, group.site_id);

    // Get all device IDs in the group
    const memberRows = await db('device_group_members')
      .where({ group_id: id })
      .select('device_id');

    const deviceIds = memberRows.map((r: { device_id: string }) => r.device_id);

    if (action === 'push_content') {
      const { payload } = req.body as { payload?: Record<string, unknown> };
      const delivered = broadcastToDevices(deviceIds, {
        type: 'config:updated',
        payload: payload || {},
        timestamp: Date.now(),
      });
      sendSuccess(res, { affected_devices: deviceIds.length, delivered, action });
      return;
    }

    if (action === 'power_on' && deviceIds.length > 0) {
      const wakeDevices = await db('devices')
        .whereIn('id', deviceIds)
        .select('id', 'display_name', 'mac_address', 'last_health');

      for (const device of wakeDevices) {
        const wakeTarget = resolveWakeMac(device);
        if (!wakeTarget.mac) {
          continue;
        }

        try {
          await sendWolPacket(wakeTarget.mac);
        } catch (err) {
          const displayName = device.display_name || device.id;
          console.warn(`[Groups] WOL failed for ${displayName}:`, err);
        }
      }
    }

    // Power actions: update device statuses
    const updates: Record<string, any> = {
      updated_at: db.fn.now(),
    };

    if (action === 'power_off') {
      updates.status = 'offline';
    } else if (action === 'restart') {
      updates.status = 'restarting';
    }

    if (deviceIds.length > 0 && Object.keys(updates).length > 1) {
      await db('devices')
        .whereIn('id', deviceIds)
        .update(updates);
    }

    // Dispatch WebSocket commands to all group devices
    const wsCommand = action === 'power_on' ? 'command:activate'
      : action === 'power_off' ? 'command:idle'
      : 'command:reload';

    const delivered = broadcastToDevices(deviceIds, {
      type: wsCommand,
      payload: { action },
      timestamp: Date.now(),
    });

    sendSuccess(res, { affected_devices: deviceIds.length, delivered, action });
  } catch (err) {
    next(err);
  }
});

export default router;
