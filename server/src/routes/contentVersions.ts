/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import { z } from 'zod';
import { buildContentUrl } from '../lib/contentFiles.js';
import { getDb } from '../lib/db.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../lib/errors.js';
import { sendSuccess } from '../lib/response.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authUser, requireRole } from '../middleware/auth.js';
import { pushToAdmins } from '../services/adminWs.js';
import { touchAndRefreshAppsUsingContent } from '../services/appRefresh.js';

const router = Router();

// --- Schemas ---

const listVersionsSchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const rollbackSchema = z
  .object({
    version: z.number().int().positive().optional(),
    versionId: z.string().uuid().optional(),
  })
  .refine(
    (data) => data.version !== undefined || data.versionId !== undefined,
    {
      message: 'Either version or versionId must be provided',
    }
  );

// --- Types ---

interface ContentVersionRow {
  id: string;
  content_id: string;
  version_number: number;
  file_path: string;
  file_size: number;
  hash: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
}

// --- Helpers ---

function checkSiteAccess(req: import('express').Request, siteId: string): void {
  if (req.user?.role === 'super_admin') return;
  if (!req.user?.site_ids || !req.user.site_ids.includes(siteId)) {
    throw new ForbiddenError('No access to this site');
  }
}

// --- Routes ---

/**
 * GET /:id/versions
 * List all versions of a content item.
 */
router.get('/:id/versions', authUser, validateQuery(listVersionsSchema), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    // Look up content
    const content = await db('content').where({ id }).first();
    if (!content) {
      throw new NotFoundError('Content', id);
    }

    // Check site access
    checkSiteAccess(req, content.site_id);

    const { limit = 50, offset = 0 } = req.query as { limit?: number; offset?: number };

    // Query versions with pagination
    const versions = await db('content_versions')
      .where({ content_id: id })
      .orderBy('version_number', 'desc')
      .limit(limit)
      .offset(offset);

    const result = versions.map((v: ContentVersionRow) => ({
      id: v.id,
      contentId: v.content_id,
      version: v.version_number,
      url: buildContentUrl(
        content.site_id,
        content.type,
        content.id,
        v.version_number,
        v.file_path
      ),
      fileSize: v.file_size,
      hash: v.hash,
      metadata: v.metadata,
      isCurrent: v.version_number === content.current_version,
      createdAt: v.created_at,
      createdBy: v.created_by,
    }));

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /:id/versions/:versionId
 * Get specific version details.
 */
router.get('/:id/versions/:versionId', authUser, async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const versionId = Array.isArray(req.params.versionId)
      ? req.params.versionId[0]
      : req.params.versionId;
    const db = getDb();

    // Look up content
    const content = await db('content').where({ id }).first();
    if (!content) {
      throw new NotFoundError('Content', id);
    }

    // Check site access
    checkSiteAccess(req, content.site_id);

    // Look up specific version
    const version = await db('content_versions')
      .where({ id: versionId, content_id: id })
      .first();

    if (!version) {
      throw new NotFoundError('Content version', versionId);
    }

    const result = {
      id: version.id,
      contentId: version.content_id,
      version: version.version_number,
      url: buildContentUrl(
        content.site_id,
        content.type,
        content.id,
        version.version_number,
        version.file_path
      ),
      fileSize: version.file_size,
      hash: version.hash,
      metadata: version.metadata,
      isCurrent: version.version_number === content.current_version,
      createdAt: version.created_at,
      createdBy: version.created_by,
    };

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /:id/rollback
 * Rollback content to a specific version.
 */
router.post(
  '/:id/rollback',
  authUser,
  requireRole(['super_admin', 'site_admin', 'content_manager']),
  validateBody(rollbackSchema),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;
      const db = getDb();

      // Look up content
      const content = await db('content').where({ id }).first();
      if (!content) {
        throw new NotFoundError('Content', id);
      }

      // Check site access
      checkSiteAccess(req, content.site_id);

      // Find target version by version number or version ID
      const { version, versionId } = req.body as {
        version?: number;
        versionId?: string;
      };

      let targetVersion: ContentVersionRow | undefined;

      if (versionId !== undefined) {
        targetVersion = await db('content_versions')
          .where({ id: versionId, content_id: id })
          .first();
      } else if (version !== undefined) {
        targetVersion = await db('content_versions')
          .where({ content_id: id, version_number: version })
          .first();
      }

      if (!targetVersion) {
        throw new NotFoundError('Content version');
      }

      // Check if already on this version
      if (targetVersion.version_number === content.current_version) {
        throw new ValidationError('Already on this version');
      }

      const previousVersion = content.current_version;

      // Update content current_version
      await db('content').where({ id }).update({
        current_version: targetVersion.version_number,
        updated_at: db.fn.now(),
      });

      // Create audit log entry
      await db('audit_logs').insert({
        user_id: req.user!.id,
        site_id: content.site_id,
        action: 'content.rollback',
        entity_type: 'content',
        entity_id: content.id,
        details: {
          from_version: previousVersion,
          to_version: targetVersion.version_number,
          content_name: content.name,
        },
        ip_address: req.ip,
      });

      // Notify admins
      pushToAdmins({
        type: 'content:updated',
        payload: { contentId: id, action: 'rollback', version: targetVersion.version_number },
        timestamp: Date.now(),
      }, content.site_id);

      await touchAndRefreshAppsUsingContent(content.site_id, id, 'content-version-rollback');

      sendSuccess(res, {
        content: {
          id: content.id,
          name: content.name,
          type: content.type,
          previousVersion,
          currentVersion: targetVersion.version_number,
        },
        rollbackVersion: {
          id: targetVersion.id,
          contentId: targetVersion.content_id,
          version: targetVersion.version_number,
          url: buildContentUrl(
            content.site_id,
            content.type,
            content.id,
            targetVersion.version_number,
            targetVersion.file_path
          ),
          fileSize: targetVersion.file_size,
          hash: targetVersion.hash,
          metadata: targetVersion.metadata,
          createdAt: targetVersion.created_at,
          createdBy: targetVersion.created_by,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
