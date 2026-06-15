/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../lib/errors.js';
import { sendSuccess, sendCreated } from '../lib/response.js';
import { validateBody } from '../middleware/validate.js';
import { authUser, requireRole } from '../middleware/auth.js';

const router = Router();

// --- Schemas ---
const createSiteSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(50),
  address: z.string().optional(),
  timezone: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const updateSiteSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).max(50).optional(),
  address: z.string().optional(),
  timezone: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional(),
}).partial();

// --- Routes ---

/**
 * GET /api/sites
 * List all sites.
 * Super_admin sees all. Others see only sites in their site_ids.
 */
router.get(
  '/',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager', 'operator']),
  async (req, res, next) => {
    try {
      const db = getDb();
      let query = db('sites')
        .select('id', 'name', 'code', 'address', 'timezone', 'config', 'is_active', 'created_at', 'updated_at')
        .orderBy('created_at', 'desc');

      // Non-super_admin: filter by user's assigned site_ids
      if (req.user?.role !== 'super_admin') {
        query = query.whereIn('id', req.user?.site_ids || []);
      }

      const sites = await query;
      sendSuccess(res, sites);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/sites
 * Create a new site (super_admin only).
 */
router.post(
  '/',
  authUser,
  requireRole(['super_admin']),
  validateBody(createSiteSchema),
  async (req, res, next) => {
    try {
      const { name, code, address, timezone, config } = req.body;
      const db = getDb();

      const [site] = await db('sites')
        .insert({
          name,
          code,
          address: address || null,
          timezone: timezone || 'Asia/Kolkata',
          config: config || null,
          is_active: true,
        })
        .returning('*');

      sendCreated(res, site);
    } catch (err: unknown) {
      // Handle unique constraint violation on code
      if (
        err instanceof Error &&
        'code' in err &&
        (err as Record<string, unknown>).code === '23505'
      ) {
        return next(new ConflictError('A site with this code already exists'));
      }
      next(err);
    }
  }
);

/**
 * GET /api/sites/:id
 * Get a single site by ID.
 * Super_admin can view any. Others must have site in site_ids.
 */
router.get('/:id', authUser, async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const site = await db('sites')
      .select('id', 'name', 'code', 'address', 'timezone', 'config', 'is_active', 'created_at', 'updated_at')
      .where({ id })
      .first();

    if (!site) {
      throw new NotFoundError('Site', id);
    }

    // Access check: super_admin or user has this site in site_ids
    if (req.user?.role !== 'super_admin') {
      if (!req.user?.site_ids || !req.user.site_ids.includes(id)) {
        throw new ForbiddenError('No access to this site');
      }
    }

    sendSuccess(res, site);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/sites/:id
 * Update a site.
 * Super_admin or site_admin only.
 */
router.put(
  '/:id',
  authUser,
  requireRole(['super_admin', 'site_admin']),
  validateBody(updateSiteSchema),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      // Check if site exists
      const existingSite = await db('sites').where({ id }).first();
      if (!existingSite) {
        throw new NotFoundError('Site', id);
      }

      // site_admin must have access to this site
      if (req.user?.role !== 'super_admin') {
        if (!req.user?.site_ids || !req.user.site_ids.includes(id)) {
          throw new ForbiddenError('No access to this site');
        }
      }

      // Build update object
      const updates: Record<string, any> = {};

      if (req.body.name !== undefined) {
        updates.name = req.body.name;
      }
      if (req.body.address !== undefined) {
        updates.address = req.body.address;
      }
      if (req.body.timezone !== undefined) {
        updates.timezone = req.body.timezone;
      }
      if (req.body.config !== undefined) {
        updates.config = req.body.config;
      }
      if (req.body.is_active !== undefined) {
        updates.is_active = req.body.is_active;
      }

      updates.updated_at = db.fn.now();

      const [updatedSite] = await db('sites')
        .where({ id })
        .update(updates)
        .returning('*');

      sendSuccess(res, updatedSite);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/sites/:id
 * Soft delete a site (set is_active=false).
 * Super_admin only.
 */
router.delete('/:id', authUser, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const existingSite = await db('sites').where({ id }).first();
    if (!existingSite) {
      throw new NotFoundError('Site', id);
    }

    // Soft delete
    await db('sites')
      .where({ id })
      .update({
        is_active: false,
        updated_at: db.fn.now(),
      });

    sendSuccess(res, { message: 'Site deactivated successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
