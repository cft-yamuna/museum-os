// NOTE: Content file serving is intentionally unauthenticated.
// Display devices fetch content files without JWT authentication.
// Screenshot serving is unauthenticated (URLs contain unguessable UUIDs + timestamps).

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { getResponseContentType, isValidStorageFilename } from '../lib/contentFiles.js';
import { NotFoundError } from '../lib/errors.js';
import { getStorage } from '../services/storageBackend.js';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

/**
 * GET /storage/:siteId/:contentType/:contentId/v:version/:filename
 * Serve a stored file with Range and ETag support
 */
router.get(
  '/:siteId/:contentType/:contentId/v:version/:filename',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const siteId = String(req.params.siteId);
      const contentType = String(req.params.contentType);
      const contentId = String(req.params.contentId);
      const version = String(req.params.version);
      const filename = String(req.params.filename);

      // Strict param validation
      if (
        !UUID_RE.test(siteId) ||
        !SAFE_SEGMENT.test(contentType) ||
        !UUID_RE.test(contentId) ||
        !/^\d+$/.test(version) ||
        !isValidStorageFilename(filename)
      ) {
        res.status(400).json({ error: 'Invalid path parameters' });
        return;
      }

      const key = path.posix.join(
        siteId,
        contentType,
        contentId,
        `v${version}`,
        filename
      );

      const storage = getStorage();

      if (!(await storage.fileExists(key))) {
        throw new NotFoundError('File', key);
      }

      const stats = await storage.getFileStats(key);
      const fileSize = stats.size;
      const mtime = stats.mtime;

      // Generate ETag
      const etag = `"${mtime.getTime()}-${fileSize}"`;

      if (req.headers['if-none-match'] === etag) {
        res.status(304).end();
        return;
      }

      const contentTypeHeader = getResponseContentType(filename, contentType);

      res.setHeader('Content-Type', contentTypeHeader);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('ETag', etag);

      // Handle Range requests
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        if (start >= fileSize || end >= fileSize) {
          res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
          return;
        }

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', chunkSize);

        const stream = await storage.getFileStreamRange(key, start, end);
        stream.pipe(res);
      } else {
        res.setHeader('Content-Length', fileSize);
        const stream = await storage.getFileStream(key);
        stream.pipe(res);
      }
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /storage/screenshots/:deviceId/:filename
 * Serve screenshot files (unauthenticated — URLs are unguessable)
 */
router.get(
  '/screenshots/:deviceId/:filename',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deviceId = String(req.params.deviceId);
      const filename = String(req.params.filename);

      // Strict validation: UUID for deviceId, safe pattern for filename
      if (!UUID_RE.test(deviceId) || !/^\d+\.(jpg|png)$/.test(filename)) {
        res.status(400).json({ error: 'Invalid path parameters' });
        return;
      }

      const key = path.posix.join('screenshots', deviceId, filename);
      const storage = getStorage();

      if (!(await storage.fileExists(key))) {
        throw new NotFoundError('File', key);
      }

      const contentTypeHeader = getResponseContentType(filename);

      res.setHeader('Content-Type', contentTypeHeader);
      res.setHeader('Cache-Control', 'public, max-age=300');

      const stream = await storage.getFileStream(key);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
