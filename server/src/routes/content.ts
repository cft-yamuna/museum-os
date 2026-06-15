/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { buildContentUrl } from '../lib/contentFiles.js';
import { sendSuccess, sendCreated } from '../lib/response.js';
import { validateQuery } from '../middleware/validate.js';
import { authUser, requireRole } from '../middleware/auth.js';
import { createUploadMiddleware, resolveUploadType } from '../middleware/upload.js';
import { storeFile } from '../services/storage.js';
import { touchAndRefreshAppsUsingContent } from '../services/appRefresh.js';

const router = Router();
const upload = createUploadMiddleware();

// --- Schemas ---
const listContentSchema = z.object({
  site_id: z.string().uuid(),
  type: z.enum(['video', 'image', 'audio', 'document', 'app']).optional(),
  search: z.string().optional(),
});

const updateContentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});

function checkSiteAccess(req: import('express').Request, siteId: string): void {
  if (req.user?.role === 'super_admin') return;
  if (!req.user?.site_ids || !req.user.site_ids.includes(siteId)) {
    throw new ForbiddenError('No access to this site');
  }
}

// --- Routes ---

/**
 * GET /api/content
 * List content with filters.
 * Query params: site_id (required), type (optional), search (optional)
 */
router.get(
  '/',
  authUser,
  validateQuery(listContentSchema),
  async (req, res, next) => {
    try {
      const { site_id, type, search } = req.query as {
        site_id: string;
        type?: string;
        search?: string;
      };

      // Check site access
      checkSiteAccess(req, site_id);

      const db = getDb();

      let query = db('content as c')
        .leftJoin('content_versions as cv', function () {
          this.on('cv.content_id', '=', 'c.id').andOn(
            'cv.version_number',
            '=',
            'c.current_version'
          );
        })
        .select(
          'c.id',
          'c.site_id',
          'c.name',
          'c.type',
          'c.description',
          'c.current_version',
          'c.is_active',
          'c.created_by',
          'c.created_at',
          'c.updated_at',
          'cv.file_path',
          'cv.file_size',
          'cv.hash',
          'cv.metadata'
        )
        .where('c.site_id', site_id)
        .where('c.is_active', true)
        .orderBy('c.updated_at', 'desc');

      if (type) {
        query = query.where('c.type', type);
      }

      if (search) {
        query = query.whereILike('c.name', `%${search}%`);
      }

      const rows = await query;

      const content = rows.map((row: any) => ({
        id: row.id,
        site_id: row.site_id,
        name: row.name,
        type: row.type,
        description: row.description,
        current_version: row.current_version,
        is_active: row.is_active,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
        file_path: row.file_path,
        file_size: row.file_size,
        hash: row.hash,
        metadata: row.metadata,
        url: row.file_path
          ? buildContentUrl(row.site_id, row.type, row.id, row.current_version, row.file_path)
          : null,
      }));

      sendSuccess(res, content);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/content
 * Upload new content (multipart form data).
 * Fields: site_id, name, description (optional)
 * File: file
 */
router.post(
  '/',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) {
        throw new ValidationError('File is required');
      }
      const resolvedUpload = resolveUploadType({
        filename: file.originalname,
        mimeType: file.mimetype,
      });

      // Validate multipart body fields manually
      const siteId = z.string().uuid().parse(req.body.site_id);
      const name = req.body.name;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new ValidationError('Name is required');
      }
      const description = req.body.description || null;

      // Check site access
      checkSiteAccess(req, siteId);

      const contentType = resolvedUpload.contentType;

      const db = getDb();

      // Insert content record
      const [content] = await db('content')
        .insert({
          site_id: siteId,
          name: name.trim(),
          type: contentType,
          description,
          current_version: 1,
          is_active: true,
          created_by: req.user!.id,
        })
        .returning('*');

      // Store file on disk
      const { filePath, fileSize, hash } = await storeFile({
        siteId,
        contentType,
        contentId: content.id,
        version: 1,
        filename: resolvedUpload.filename,
        buffer: file.buffer,
      });

      // Insert version record
      const [version] = await db('content_versions')
        .insert({
          content_id: content.id,
          version_number: 1,
          file_path: filePath,
          file_size: fileSize,
          hash,
          metadata: {
            originalName: resolvedUpload.filename,
            mimeType: resolvedUpload.mimeType,
          },
          created_by: req.user!.id,
        })
        .returning('*');

      const url = buildContentUrl(siteId, contentType, content.id, 1, filePath);

      sendCreated(res, {
        ...content,
        file_path: version.file_path,
        file_size: version.file_size,
        hash: version.hash,
        metadata: version.metadata,
        url,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/content/:id
 * Get content details with current version info.
 */
router.get('/:id', authUser, async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const row = await db('content as c')
      .leftJoin('content_versions as cv', function () {
        this.on('cv.content_id', '=', 'c.id').andOn(
          'cv.version_number',
          '=',
          'c.current_version'
        );
      })
      .select(
        'c.id',
        'c.site_id',
        'c.name',
        'c.type',
        'c.description',
        'c.current_version',
        'c.is_active',
        'c.created_by',
        'c.created_at',
        'c.updated_at',
        'cv.file_path',
        'cv.file_size',
        'cv.hash',
        'cv.metadata'
      )
      .where('c.id', id)
      .first();

    if (!row) {
      throw new NotFoundError('Content', id);
    }

    // Check site access
    checkSiteAccess(req, row.site_id);

    const url = row.file_path
      ? buildContentUrl(row.site_id, row.type, row.id, row.current_version, row.file_path)
      : null;

    sendSuccess(res, {
      id: row.id,
      site_id: row.site_id,
      name: row.name,
      type: row.type,
      description: row.description,
      current_version: row.current_version,
      is_active: row.is_active,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      file_path: row.file_path,
      file_size: row.file_size,
      hash: row.hash,
      metadata: row.metadata,
      url,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/content/:id
 * Update content metadata only (name, description, is_active).
 */
router.put(
  '/:id',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      // Check content exists
      const existing = await db('content').where({ id }).first();
      if (!existing) {
        throw new NotFoundError('Content', id);
      }

      // Check site access
      checkSiteAccess(req, existing.site_id);

      // Validate body
      const body = updateContentSchema.parse(req.body);

      // Build update object
      const updates: Record<string, any> = {};

      if (body.name !== undefined) {
        updates.name = body.name;
      }
      if (body.description !== undefined) {
        updates.description = body.description;
      }
      if (body.is_active !== undefined) {
        updates.is_active = body.is_active;
      }

      updates.updated_at = db.fn.now();

      const [updated] = await db('content')
        .where({ id })
        .update(updates)
        .returning('*');

      sendSuccess(res, updated);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/content/:id
 * Upload a new version of existing content.
 */
router.post(
  '/:id',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const file = req.file;
      if (!file) {
        throw new ValidationError('File is required');
      }
      const resolvedUpload = resolveUploadType({
        filename: file.originalname,
        mimeType: file.mimetype,
      });

      const db = getDb();

      // Check content exists
      const existing = await db('content').where({ id }).first();
      if (!existing) {
        throw new NotFoundError('Content', id);
      }

      // Check site access
      checkSiteAccess(req, existing.site_id);

      // Validate the uploaded file type matches the existing content type.
      const uploadedContentType = resolvedUpload.contentType;
      if (uploadedContentType !== existing.type) {
        throw new ValidationError(
          `File type mismatch: expected ${existing.type}, got ${uploadedContentType}`
        );
      }

      const newVersion = existing.current_version + 1;

      // Store file on disk
      const { filePath, fileSize, hash } = await storeFile({
        siteId: existing.site_id,
        contentType: existing.type,
        contentId: id,
        version: newVersion,
        filename: resolvedUpload.filename,
        buffer: file.buffer,
      });

      // Insert version record
      const [version] = await db('content_versions')
        .insert({
          content_id: id,
          version_number: newVersion,
          file_path: filePath,
          file_size: fileSize,
          hash,
          metadata: {
            originalName: resolvedUpload.filename,
            mimeType: resolvedUpload.mimeType,
          },
          created_by: req.user!.id,
        })
        .returning('*');

      // Update content current_version
      const [updated] = await db('content')
        .where({ id })
        .update({
          current_version: newVersion,
          updated_at: db.fn.now(),
        })
        .returning('*');

      const url = buildContentUrl(
        existing.site_id,
        existing.type,
        id,
        newVersion,
        filePath
      );

      await touchAndRefreshAppsUsingContent(existing.site_id, id, 'content-version-uploaded');

      sendSuccess(res, {
        ...updated,
        file_path: version.file_path,
        file_size: version.file_size,
        hash: version.hash,
        metadata: version.metadata,
        url,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/content/:id
 * Soft delete content (set is_active=false).
 */
router.delete(
  '/:id',
  authUser,
  requireRole(['super_admin', 'site_admin']),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const existing = await db('content').where({ id }).first();
      if (!existing) {
        throw new NotFoundError('Content', id);
      }

      // Check site access
      checkSiteAccess(req, existing.site_id);

      // Soft delete
      await db('content')
        .where({ id })
        .update({
          is_active: false,
          updated_at: db.fn.now(),
        });

      sendSuccess(res, { message: 'Content deactivated successfully' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
