/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { sendSuccess, sendCreated } from '../lib/response.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authUser, requireRole } from '../middleware/auth.js';
import { sendToDevice } from '../services/displayWs.js';
import { pushToAdmins } from '../services/adminWs.js';

const router = Router();

// --- Schemas ---

const listExhibitionsSchema = z.object({
  site_id: z.string().uuid(),
});

const createExhibitionSchema = z.object({
  site_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

const updateExhibitionSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

const createAssignmentSchema = z.object({
  device_id: z.string().uuid(),
  content_id: z.string().uuid().optional(),
  playlist_id: z.string().uuid().optional(),
  config: z.record(z.unknown()).optional(),
}).refine(data => data.content_id || data.playlist_id, {
  message: 'Either content_id or playlist_id must be provided',
});

const updateAssignmentSchema = z.object({
  content_id: z.string().uuid().nullable().optional(),
  playlist_id: z.string().uuid().nullable().optional(),
  config: z.record(z.unknown()).optional(),
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
 * GET /api/exhibitions
 * List exhibitions filtered by site_id (required).
 * Includes assignment_count via subquery.
 */
router.get('/', authUser, validateQuery(listExhibitionsSchema), async (req, res, next) => {
  try {
    const { site_id } = req.query as { site_id: string };

    checkSiteAccess(req, site_id);

    const db = getDb();
    const exhibitions = await db('exhibitions')
      .select(
        'exhibitions.*',
        db.raw(
          '(SELECT COUNT(*) FROM exhibition_assignments WHERE exhibition_assignments.exhibition_id = exhibitions.id)::int AS assignment_count'
        )
      )
      .where({ site_id })
      .orderBy('created_at', 'desc');

    sendSuccess(res, exhibitions);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/exhibitions
 * Create a new exhibition.
 */
router.post('/', authUser, requireRole(['super_admin', 'site_admin']), validateBody(createExhibitionSchema), async (req, res, next) => {
  try {
    const { site_id, name, description, start_date, end_date } = req.body;

    checkSiteAccess(req, site_id);

    const db = getDb();

    const [exhibition] = await db('exhibitions')
      .insert({
        site_id,
        name,
        description: description || null,
        start_date: start_date || null,
        end_date: end_date || null,
      })
      .returning('*');

    sendCreated(res, exhibition);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/exhibitions/:id
 * Get a single exhibition with its assignments.
 * Each assignment includes joined device, content, and playlist info.
 */
router.get('/:id', authUser, async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const exhibition = await db('exhibitions').where({ id }).first();

    if (!exhibition) {
      throw new NotFoundError('Exhibition', id);
    }

    checkSiteAccess(req, exhibition.site_id);

    // Fetch assignments with joined device, content, and playlist data
    const rawAssignments = await db('exhibition_assignments')
      .leftJoin('devices', 'exhibition_assignments.device_id', 'devices.id')
      .leftJoin('content', 'exhibition_assignments.content_id', 'content.id')
      .leftJoin('playlists', 'exhibition_assignments.playlist_id', 'playlists.id')
      .select(
        'exhibition_assignments.id',
        'exhibition_assignments.device_id',
        'exhibition_assignments.content_id',
        'exhibition_assignments.playlist_id',
        'exhibition_assignments.config',
        'devices.display_name as device_name',
        'devices.type as device_type',
        'devices.status as device_status',
        'content.name as content_name',
        'content.type as content_type',
        'playlists.name as playlist_name'
      )
      .where('exhibition_assignments.exhibition_id', id);

    const assignments = rawAssignments.map((row: Record<string, unknown>) => ({
      id: row.id,
      deviceId: row.device_id,
      device: {
        name: row.device_name,
        type: row.device_type,
        status: row.device_status,
      },
      content: row.content_id
        ? { id: row.content_id, name: row.content_name, type: row.content_type }
        : null,
      playlist: row.playlist_id
        ? { id: row.playlist_id, name: row.playlist_name }
        : null,
      config: row.config,
    }));

    sendSuccess(res, { ...exhibition, assignments });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/exhibitions/:id
 * Update an exhibition (name, description, start_date, end_date, is_active).
 */
router.put('/:id', authUser, requireRole(['super_admin', 'site_admin']), validateBody(updateExhibitionSchema), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const existing = await db('exhibitions').where({ id }).first();
    if (!existing) {
      throw new NotFoundError('Exhibition', id);
    }

    checkSiteAccess(req, existing.site_id);

    const updates: Record<string, unknown> = {};

    if (req.body.name !== undefined) {
      updates.name = req.body.name;
    }
    if (req.body.description !== undefined) {
      updates.description = req.body.description;
    }
    if (req.body.start_date !== undefined) {
      updates.start_date = req.body.start_date;
    }
    if (req.body.end_date !== undefined) {
      updates.end_date = req.body.end_date;
    }
    if (req.body.is_active !== undefined) {
      updates.is_active = req.body.is_active;
    }

    const [updated] = await db('exhibitions')
      .where({ id })
      .update(updates)
      .returning('*');

    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/exhibitions/:id
 * Hard delete an exhibition (CASCADE removes assignments).
 * Super admin only.
 */
router.delete('/:id', authUser, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const existing = await db('exhibitions').where({ id }).first();
    if (!existing) {
      throw new NotFoundError('Exhibition', id);
    }

    await db('exhibitions').where({ id }).del();

    sendSuccess(res, { message: 'Exhibition deleted successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/exhibitions/:id/assignments
 * Add an assignment to an exhibition.
 * Validates device, content, and playlist belong to the same site.
 */
router.post('/:id/assignments', authUser, requireRole(['super_admin', 'site_admin']), validateBody(createAssignmentSchema), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { device_id, content_id, playlist_id, config } = req.body;
    const db = getDb();

    // Verify exhibition exists
    const exhibition = await db('exhibitions').where({ id }).first();
    if (!exhibition) {
      throw new NotFoundError('Exhibition', id);
    }

    checkSiteAccess(req, exhibition.site_id);

    // Verify device exists and belongs to same site
    const device = await db('devices').where({ id: device_id }).first();
    if (!device) {
      throw new NotFoundError('Device', device_id);
    }
    if (device.site_id !== exhibition.site_id) {
      throw new ValidationError('Device must belong to the same site as the exhibition');
    }

    // Verify content exists and belongs to same site (if provided)
    if (content_id) {
      const content = await db('content').where({ id: content_id }).first();
      if (!content) {
        throw new NotFoundError('Content', content_id);
      }
      if (content.site_id !== exhibition.site_id) {
        throw new ValidationError('Content must belong to the same site as the exhibition');
      }
    }

    // Verify playlist exists and belongs to same site (if provided)
    if (playlist_id) {
      const playlist = await db('playlists').where({ id: playlist_id }).first();
      if (!playlist) {
        throw new NotFoundError('Playlist', playlist_id);
      }
      if (playlist.site_id !== exhibition.site_id) {
        throw new ValidationError('Playlist must belong to the same site as the exhibition');
      }
    }

    const [assignment] = await db('exhibition_assignments')
      .insert({
        exhibition_id: id,
        device_id,
        content_id: content_id || null,
        playlist_id: playlist_id || null,
        config: config ? JSON.stringify(config) : null,
      })
      .returning('*');

    sendCreated(res, assignment);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/exhibitions/:id/assignments/:assignmentId
 * Update an assignment (content_id, playlist_id, config).
 * After update, at least one of content_id/playlist_id must be non-null.
 */
router.put('/:id/assignments/:assignmentId', authUser, requireRole(['super_admin', 'site_admin']), validateBody(updateAssignmentSchema), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const assignmentId = Array.isArray(req.params.assignmentId) ? req.params.assignmentId[0] : req.params.assignmentId;
    const db = getDb();

    // Verify exhibition exists
    const exhibition = await db('exhibitions').where({ id }).first();
    if (!exhibition) {
      throw new NotFoundError('Exhibition', id);
    }

    checkSiteAccess(req, exhibition.site_id);

    // Verify assignment exists and belongs to this exhibition
    const existing = await db('exhibition_assignments')
      .where({ id: assignmentId, exhibition_id: id })
      .first();

    if (!existing) {
      throw new NotFoundError('Assignment', assignmentId);
    }

    const updates: Record<string, unknown> = {};

    if (req.body.content_id !== undefined) {
      updates.content_id = req.body.content_id;
    }
    if (req.body.playlist_id !== undefined) {
      updates.playlist_id = req.body.playlist_id;
    }
    if (req.body.config !== undefined) {
      updates.config = req.body.config ? JSON.stringify(req.body.config) : null;
    }

    // Determine final content_id and playlist_id after update
    const finalContentId = updates.content_id !== undefined ? updates.content_id : existing.content_id;
    const finalPlaylistId = updates.playlist_id !== undefined ? updates.playlist_id : existing.playlist_id;

    if (!finalContentId && !finalPlaylistId) {
      throw new ValidationError('At least one of content_id or playlist_id must be non-null');
    }

    const [updated] = await db('exhibition_assignments')
      .where({ id: assignmentId })
      .update(updates)
      .returning('*');

    sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/exhibitions/:id/assignments/:assignmentId
 * Remove an assignment from an exhibition.
 */
router.delete('/:id/assignments/:assignmentId', authUser, requireRole(['super_admin', 'site_admin']), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const assignmentId = Array.isArray(req.params.assignmentId) ? req.params.assignmentId[0] : req.params.assignmentId;
    const db = getDb();

    // Verify exhibition exists
    const exhibition = await db('exhibitions').where({ id }).first();
    if (!exhibition) {
      throw new NotFoundError('Exhibition', id);
    }

    checkSiteAccess(req, exhibition.site_id);

    // Verify assignment belongs to this exhibition and delete
    const deleted = await db('exhibition_assignments')
      .where({ id: assignmentId, exhibition_id: id })
      .del();

    if (deleted === 0) {
      throw new NotFoundError('Assignment', assignmentId);
    }

    sendSuccess(res, { message: 'Assignment removed successfully' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/exhibitions/:id/activate
 * Activate an exhibition: push configs to all assigned devices.
 * Merges exhibition assignment data into each device's config JSONB column.
 */
router.post('/:id/activate', authUser, requireRole(['super_admin', 'site_admin']), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    // Verify exhibition exists
    const exhibition = await db('exhibitions').where({ id }).first();
    if (!exhibition) {
      throw new NotFoundError('Exhibition', id);
    }

    checkSiteAccess(req, exhibition.site_id);

    // Get all assignments for this exhibition
    const assignments = await db('exhibition_assignments')
      .where({ exhibition_id: id });

    let devicesUpdated = 0;

    for (const assignment of assignments) {
      const newConfig = {
        activeExhibition: exhibition.id,
        assignedContent: assignment.content_id || null,
        assignedPlaylist: assignment.playlist_id || null,
        exhibitionConfig: assignment.config,
      };

      await db('devices')
        .where({ id: assignment.device_id })
        .update({
          config: db.raw("config || ?::jsonb", [JSON.stringify(newConfig)]),
        });

      devicesUpdated++;
    }

    // Push config:updated to each device
    for (const assignment of assignments) {
      sendToDevice(assignment.device_id, {
        type: 'config:updated',
        payload: { exhibitionId: id },
        timestamp: Date.now(),
      });
    }
    pushToAdmins({
      type: 'exhibition:activated',
      payload: { exhibitionId: id, name: exhibition.name, devices: assignments.length },
      timestamp: Date.now(),
    }, exhibition.site_id);

    sendSuccess(res, { activated: true, devices_updated: devicesUpdated });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/exhibitions/:id/deactivate
 * Deactivate an exhibition: remove exhibition-related keys from all assigned device configs.
 */
router.post('/:id/deactivate', authUser, requireRole(['super_admin', 'site_admin']), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    // Verify exhibition exists
    const exhibition = await db('exhibitions').where({ id }).first();
    if (!exhibition) {
      throw new NotFoundError('Exhibition', id);
    }

    checkSiteAccess(req, exhibition.site_id);

    // Get all assignments for this exhibition
    const assignments = await db('exhibition_assignments')
      .where({ exhibition_id: id });

    const deviceIds = assignments.map((a: { device_id: string }) => a.device_id);
    let devicesUpdated = 0;

    if (deviceIds.length > 0) {
      devicesUpdated = await db('devices')
        .whereIn('id', deviceIds)
        .update({
          config: db.raw("config - 'activeExhibition' - 'assignedContent' - 'assignedPlaylist' - 'exhibitionConfig'"),
        });
    }

    // Push config:updated to each device
    for (const deviceId of deviceIds) {
      sendToDevice(deviceId, {
        type: 'config:updated',
        payload: { exhibitionId: id, deactivated: true },
        timestamp: Date.now(),
      });
    }
    pushToAdmins({
      type: 'exhibition:deactivated',
      payload: { exhibitionId: id, name: exhibition.name, devices: deviceIds.length },
      timestamp: Date.now(),
    }, exhibition.site_id);

    sendSuccess(res, { deactivated: true, devices_updated: devicesUpdated });
  } catch (err) {
    next(err);
  }
});

export default router;
