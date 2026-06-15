/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import type { Request as ExpressRequest } from 'express';
import { z } from 'zod';
import { buildContentUrl } from '../lib/contentFiles.js';
import { getDb } from '../lib/db.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { sendSuccess, sendCreated } from '../lib/response.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authUser, authUserOrDevice, requireRole } from '../middleware/auth.js';
import { pushToAdmins } from '../services/adminWs.js';
import { touchAndRefreshAppsUsingPlaylist } from '../services/appRefresh.js';

const router = Router();

// --- Schemas ---

const listPlaylistsSchema = z.object({
  site_id: z.string().uuid(),
});

const createPlaylistSchema = z.object({
  site_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  loop: z.boolean().optional(),
});

const updatePlaylistSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  loop: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

const addItemSchema = z.object({
  content_id: z.string().uuid(),
  position: z.number().int().optional(),
  duration_sec: z.number().int().positive().optional(),
  transition: z.enum(['fade', 'slide-left', 'slide-right', 'dissolve', 'none']).optional(),
  config: z.record(z.unknown()).optional(),
});

const updateItemSchema = z.object({
  position: z.number().int().optional(),
  duration_sec: z.number().int().positive().optional(),
  transition: z.enum(['fade', 'slide-left', 'slide-right', 'dissolve', 'none']).optional(),
  config: z.record(z.unknown()).optional(),
});

const reorderSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    position: z.number().int(),
  })).min(1),
});

// --- Helpers ---

/**
 * Check that the authenticated user has access to the given site.
 * Super admins always pass; others must have the site in their site_ids.
 */
function checkSiteAccess(req: Express.Request & { user?: { role: string; site_ids: string[] | null }; device?: { site_id: string } }, siteId: string): void {
  // Device auth: device must belong to the same site
  if (req.device) {
    if (req.device.site_id !== siteId) {
      throw new ForbiddenError('Device does not belong to this site');
    }
    return;
  }
  // Admin auth
  if (req.user?.role === 'super_admin') return;
  if (!req.user?.site_ids || !req.user.site_ids.includes(siteId)) {
    throw new ForbiddenError('No access to this site');
  }
}

function shouldSkipAppRefresh(req: ExpressRequest): boolean {
  const raw = req.query.skip_app_refresh;
  if (Array.isArray(raw)) {
    return raw.some((value) => value === 'true' || value === '1');
  }
  return raw === 'true' || raw === '1';
}

// --- Routes ---

/**
 * GET /api/playlists
 * List playlists filtered by site_id (required).
 * Includes item_count via subquery.
 */
router.get('/', authUser, validateQuery(listPlaylistsSchema), async (req, res, next) => {
  try {
    const { site_id } = req.query as { site_id: string };

    checkSiteAccess(req, site_id);

    const db = getDb();
    const playlists = await db('playlists')
      .select(
        'playlists.*',
        db.raw(
          '(SELECT COUNT(*) FROM playlist_items WHERE playlist_items.playlist_id = playlists.id)::int AS item_count'
        )
      )
      .where({ site_id })
      .orderBy('updated_at', 'desc');

    sendSuccess(res, playlists);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/playlists
 * Create a new playlist.
 */
router.post(
  '/',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  validateBody(createPlaylistSchema),
  async (req, res, next) => {
    try {
      const { site_id, name, description, loop } = req.body;

      checkSiteAccess(req, site_id);

      const db = getDb();

      const [playlist] = await db('playlists')
        .insert({
          site_id,
          name,
          description: description || null,
          loop: loop !== undefined ? loop : true,
          is_active: true,
          created_by: req.user!.id,
        })
        .returning('*');

      sendCreated(res, playlist);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/playlists/:id
 * Get a single playlist with its items (including content details).
 */
router.get('/:id', authUserOrDevice, async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const playlist = await db('playlists').where({ id }).first();

    if (!playlist) {
      throw new NotFoundError('Playlist', id);
    }

    checkSiteAccess(req, playlist.site_id);

    // Fetch items with content details
    const rawItems = await db('playlist_items')
      .join('content', 'playlist_items.content_id', 'content.id')
      .join('content_versions', function () {
        this.on('content_versions.content_id', '=', 'content.id')
          .andOn('content_versions.version_number', '=', 'content.current_version');
      })
      .select(
        'playlist_items.id',
        'playlist_items.content_id',
        'content.name as content_name',
        'content.type as content_type',
        'playlist_items.position',
        'playlist_items.duration_sec',
        'playlist_items.transition',
        'playlist_items.config',
        'content.current_version',
        'content_versions.file_path'
      )
      .where('playlist_items.playlist_id', id)
      .orderBy('playlist_items.position', 'asc');

    const items = rawItems.map((item: {
      id: string;
      content_id: string;
      content_name: string;
      content_type: string;
      position: number;
      duration_sec: number;
      transition: string;
      config: Record<string, unknown> | null;
      current_version: number;
      file_path: string;
    }) => ({
      id: item.id,
      contentId: item.content_id,
      content: {
        name: item.content_name,
        type: item.content_type,
      },
      position: item.position,
      duration: item.duration_sec,
      transition: item.transition,
      url: buildContentUrl(
        playlist.site_id,
        item.content_type,
        item.content_id,
        item.current_version,
        item.file_path
      ),
      config: item.config,
    }));

    sendSuccess(res, { ...playlist, items });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/playlists/:id
 * Update playlist metadata (name, description, loop, is_active).
 */
router.put(
  '/:id',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  validateBody(updatePlaylistSchema),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const existingPlaylist = await db('playlists').where({ id }).first();
      if (!existingPlaylist) {
        throw new NotFoundError('Playlist', id);
      }

      checkSiteAccess(req, existingPlaylist.site_id);

      const updates: Record<string, any> = {};

      if (req.body.name !== undefined) {
        updates.name = req.body.name;
      }
      if (req.body.description !== undefined) {
        updates.description = req.body.description;
      }
      if (req.body.loop !== undefined) {
        updates.loop = req.body.loop;
      }
      if (req.body.is_active !== undefined) {
        updates.is_active = req.body.is_active;
      }

      updates.updated_at = db.fn.now();

      const [updatedPlaylist] = await db('playlists')
        .where({ id })
        .update(updates)
        .returning('*');

      await touchAndRefreshAppsUsingPlaylist(existingPlaylist.site_id, id, 'playlist-updated');
      sendSuccess(res, updatedPlaylist);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/playlists/:id
 * Soft delete a playlist (set is_active = false).
 */
router.delete(
  '/:id',
  authUser,
  requireRole(['super_admin', 'site_admin']),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const existingPlaylist = await db('playlists').where({ id }).first();
      if (!existingPlaylist) {
        throw new NotFoundError('Playlist', id);
      }

      checkSiteAccess(req, existingPlaylist.site_id);

      await db('playlists')
        .where({ id })
        .update({
          is_active: false,
          updated_at: db.fn.now(),
        });

      await touchAndRefreshAppsUsingPlaylist(existingPlaylist.site_id, id, 'playlist-deleted');
      sendSuccess(res, { message: 'Playlist deactivated successfully' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/playlists/:id/items
 * Add an item to a playlist.
 * Verifies content exists and belongs to the same site.
 * Auto-assigns position if not provided.
 */
router.post(
  '/:id/items',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  validateBody(addItemSchema),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { content_id, position, duration_sec, transition, config } = req.body;
      const db = getDb();

      // Verify playlist exists
      const playlist = await db('playlists').where({ id }).first();
      if (!playlist) {
        throw new NotFoundError('Playlist', id);
      }

      checkSiteAccess(req, playlist.site_id);

      // Verify content exists and belongs to the same site
      const content = await db('content').where({ id: content_id }).first();
      if (!content) {
        throw new NotFoundError('Content', content_id);
      }
      if (content.site_id !== playlist.site_id) {
        throw new ValidationError('Content must belong to the same site as the playlist');
      }

      // Determine position: use provided or MAX(position) + 1
      let itemPosition = position;
      if (itemPosition === undefined) {
        const maxRow = await db('playlist_items')
          .where({ playlist_id: id })
          .max('position as max_pos')
          .first();
        const maxPos = maxRow && maxRow.max_pos !== null ? maxRow.max_pos : -1;
        itemPosition = maxPos + 1;
      }

      // Insert item
      const [createdItem] = await db('playlist_items')
        .insert({
          playlist_id: id,
          content_id,
          position: itemPosition,
          duration_sec: duration_sec || null,
          transition: transition || 'fade',
          config: config ? JSON.stringify(config) : null,
        })
        .returning('*');

      // Update playlist.updated_at
      await db('playlists')
        .where({ id })
        .update({ updated_at: db.fn.now() });

      // Fetch content details for the response
      const contentVersion = await db('content_versions')
        .where({
          content_id: content.id,
          version_number: content.current_version,
        })
        .first();

      const responseItem = {
        id: createdItem.id,
        contentId: createdItem.content_id,
        content: {
          name: content.name,
          type: content.type,
        },
        position: createdItem.position,
        duration: createdItem.duration_sec,
        transition: createdItem.transition,
        url: contentVersion
          ? buildContentUrl(
              playlist.site_id,
              content.type,
              content.id,
              content.current_version,
              contentVersion.file_path
            )
          : null,
        config: createdItem.config,
      };

      pushToAdmins({
        type: 'playlist:updated',
        payload: { playlistId: id },
        timestamp: Date.now(),
      }, playlist.site_id);

      if (!shouldSkipAppRefresh(req)) {
        await touchAndRefreshAppsUsingPlaylist(playlist.site_id, id, 'playlist-item-added');
      }
      sendCreated(res, responseItem);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/playlists/:id/items/reorder
 * Batch reorder items within a playlist.
 * Must be registered BEFORE /:id/items/:itemId to avoid route conflicts.
 */
router.put(
  '/:id/items/reorder',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  validateBody(reorderSchema),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { items } = req.body as { items: Array<{ id: string; position: number }> };
      const db = getDb();

      // Verify playlist exists
      const playlist = await db('playlists').where({ id }).first();
      if (!playlist) {
        throw new NotFoundError('Playlist', id);
      }

      checkSiteAccess(req, playlist.site_id);

      // Update all positions in a transaction
      await db.transaction(async (trx) => {
        for (const item of items) {
          await trx('playlist_items')
            .where({ id: item.id, playlist_id: id })
            .update({ position: item.position });
        }

        // Update playlist.updated_at
        await trx('playlists')
          .where({ id })
          .update({ updated_at: trx.fn.now() });
      });

      pushToAdmins({
        type: 'playlist:updated',
        payload: { playlistId: id },
        timestamp: Date.now(),
      }, playlist.site_id);

      if (!shouldSkipAppRefresh(req)) {
        await touchAndRefreshAppsUsingPlaylist(playlist.site_id, id, 'playlist-reordered');
      }
      sendSuccess(res, { message: 'Items reordered successfully' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/playlists/:id/items/:itemId
 * Update a playlist item (position, duration_sec, transition, config).
 */
router.put(
  '/:id/items/:itemId',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  validateBody(updateItemSchema),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
      const db = getDb();

      // Verify playlist exists
      const playlist = await db('playlists').where({ id }).first();
      if (!playlist) {
        throw new NotFoundError('Playlist', id);
      }

      checkSiteAccess(req, playlist.site_id);

      // Verify item belongs to this playlist
      const existingItem = await db('playlist_items')
        .where({ id: itemId, playlist_id: id })
        .first();
      if (!existingItem) {
        throw new NotFoundError('Playlist item', itemId);
      }

      // Build update object
      const updates: Record<string, any> = {};

      if (req.body.position !== undefined) {
        updates.position = req.body.position;
      }
      if (req.body.duration_sec !== undefined) {
        updates.duration_sec = req.body.duration_sec;
      }
      if (req.body.transition !== undefined) {
        updates.transition = req.body.transition;
      }
      if (req.body.config !== undefined) {
        updates.config = JSON.stringify(req.body.config);
      }

      const [updatedItem] = await db('playlist_items')
        .where({ id: itemId })
        .update(updates)
        .returning('*');

      // Update playlist.updated_at
      await db('playlists')
        .where({ id })
        .update({ updated_at: db.fn.now() });

      pushToAdmins({
        type: 'playlist:updated',
        payload: { playlistId: id },
        timestamp: Date.now(),
      }, playlist.site_id);

      if (!shouldSkipAppRefresh(req)) {
        await touchAndRefreshAppsUsingPlaylist(playlist.site_id, id, 'playlist-item-updated');
      }
      sendSuccess(res, updatedItem);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/playlists/:id/items/:itemId
 * Remove an item from a playlist (hard delete).
 */
router.delete(
  '/:id/items/:itemId',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
      const db = getDb();

      // Verify playlist exists
      const playlist = await db('playlists').where({ id }).first();
      if (!playlist) {
        throw new NotFoundError('Playlist', id);
      }

      checkSiteAccess(req, playlist.site_id);

      // Delete item
      const deleted = await db('playlist_items')
        .where({ id: itemId, playlist_id: id })
        .del();

      if (deleted === 0) {
        throw new NotFoundError('Playlist item', itemId);
      }

      // Update playlist.updated_at
      await db('playlists')
        .where({ id })
        .update({ updated_at: db.fn.now() });

      pushToAdmins({
        type: 'playlist:updated',
        payload: { playlistId: id },
        timestamp: Date.now(),
      }, playlist.site_id);

      if (!shouldSkipAppRefresh(req)) {
        await touchAndRefreshAppsUsingPlaylist(playlist.site_id, id, 'playlist-item-removed');
      }
      sendSuccess(res, { message: 'Item removed from playlist' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
