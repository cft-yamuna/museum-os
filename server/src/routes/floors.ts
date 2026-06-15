/// <reference path="../types/express.d.ts" />
import { Router, Request } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';
import { sendSuccess, sendCreated, sendNoContent } from '../lib/response.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authUser, requireRole } from '../middleware/auth.js';

const router = Router();

// --- Schemas ---
const listFloorsQuerySchema = z.object({
  site_id: z.string().uuid('site_id must be a valid UUID'),
});

const createFloorSchema = z.object({
  site_id: z.string().uuid(),
  name: z.string().min(1),
  level: z.number().int().optional(),
  background_image: z.string().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  config: z.record(z.unknown()).optional(),
});

const updateFloorSchema = z.object({
  name: z.string().min(1).optional(),
  level: z.number().int().optional(),
  background_image: z.string().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  config: z.record(z.unknown()).optional(),
}).partial();

// --- Helper ---
function checkSiteAccess(req: Request, siteId: string): void {
  if (req.user?.role === 'super_admin') return;
  if (!req.user?.site_ids || !req.user.site_ids.includes(siteId)) {
    throw new ForbiddenError('No access to this site');
  }
}

// --- Routes ---

/**
 * GET /api/floors?site_id=<uuid>
 * List floors for a site. Requires site_id query param.
 */
router.get(
  '/',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager', 'operator']),
  validateQuery(listFloorsQuerySchema),
  async (req, res, next) => {
    try {
      const siteId = req.query.site_id as string;
      checkSiteAccess(req, siteId);

      const db = getDb();
      const floors = await db('floors')
        .select('id', 'site_id', 'name', 'level', 'background_image', 'width', 'height', 'config', 'created_at')
        .where({ site_id: siteId })
        .orderBy('level', 'asc');

      sendSuccess(res, floors);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/floors
 * Create a new floor. Requires access to the target site.
 */
router.post(
  '/',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  validateBody(createFloorSchema),
  async (req, res, next) => {
    try {
      const { site_id, name, level, background_image, width, height, config } = req.body;
      checkSiteAccess(req, site_id);

      const db = getDb();

      const [floor] = await db('floors')
        .insert({
          site_id,
          name,
          level: level ?? null,
          background_image: background_image || null,
          width: width ?? null,
          height: height ?? null,
          config: config || null,
        })
        .returning('*');

      sendCreated(res, floor);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/floors/:id
 * Get a single floor by ID. Includes device count.
 */
router.get('/:id', authUser, async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const floor = await db('floors')
      .select('id', 'site_id', 'name', 'level', 'background_image', 'width', 'height', 'config', 'created_at')
      .where({ id })
      .first();

    if (!floor) {
      throw new NotFoundError('Floor', id);
    }

    checkSiteAccess(req, floor.site_id);

    // Get device count for this floor
    const [{ count }] = await db('devices')
      .where({ floor_id: id })
      .count('id as count');

    sendSuccess(res, { ...floor, device_count: Number(count) });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/floors/:id
 * Update a floor. Requires site access.
 */
router.put(
  '/:id',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  validateBody(updateFloorSchema),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      // Check if floor exists
      const existingFloor = await db('floors').where({ id }).first();
      if (!existingFloor) {
        throw new NotFoundError('Floor', id);
      }

      checkSiteAccess(req, existingFloor.site_id);

      // Build update object
      const updates: Record<string, any> = {};

      if (req.body.name !== undefined) {
        updates.name = req.body.name;
      }
      if (req.body.level !== undefined) {
        updates.level = req.body.level;
      }
      if (req.body.background_image !== undefined) {
        updates.background_image = req.body.background_image;
      }
      if (req.body.width !== undefined) {
        updates.width = req.body.width;
      }
      if (req.body.height !== undefined) {
        updates.height = req.body.height;
      }
      if (req.body.config !== undefined) {
        updates.config = req.body.config;
      }

      const [updatedFloor] = await db('floors')
        .where({ id })
        .update(updates)
        .returning('*');

      sendSuccess(res, updatedFloor);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/floors/:id
 * Hard delete a floor. CASCADE handles devices.floor_id SET NULL.
 */
router.delete(
  '/:id',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const existingFloor = await db('floors').where({ id }).first();
      if (!existingFloor) {
        throw new NotFoundError('Floor', id);
      }

      checkSiteAccess(req, existingFloor.site_id);

      await db('floors').where({ id }).del();

      sendNoContent(res);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
