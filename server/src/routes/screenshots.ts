/// <reference path="../types/express.d.ts" />
import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { getDb } from '../lib/db.js';
import { sendSuccess, sendError } from '../lib/response.js';
import { authUser } from '../middleware/auth.js';
import { getStorage } from '../services/storageBackend.js';

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Pre-auth middleware: reject requests without API key before multer processes body ---
function preAuthApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey) {
    sendError(res, 401, 'Missing x-api-key header', 'UNAUTHORIZED');
    return;
  }
  next();
}

// --- Multer config: memory storage, 10MB max, JPEG/PNG only ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG files are allowed'));
    }
  },
});

/**
 * POST /api/devices/:id/screenshot
 * Agent uploads a screenshot using x-api-key header auth.
 */
router.post(
  '/:id/screenshot',
  preAuthApiKey,
  upload.single('screenshot'),
  async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const deviceId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;

      // Validate UUID format to prevent path traversal
      if (!UUID_REGEX.test(deviceId)) {
        sendError(res, 400, 'Invalid device ID format', 'INVALID_ID');
        return;
      }

      const apiKey = req.headers['x-api-key'] as string;

      // Look up device by API key stored in config->>'apiKey'
      const db = getDb();
      const device = await db('devices')
        .whereRaw("config->>'apiKey' = ?", [apiKey])
        .first();

      if (!device) {
        sendError(res, 401, 'Invalid API key', 'UNAUTHORIZED');
        return;
      }

      // Validate that the device ID in the URL matches
      if (device.id !== deviceId) {
        sendError(res, 403, 'API key does not match device', 'FORBIDDEN');
        return;
      }

      if (!req.file) {
        sendError(res, 400, 'No screenshot file provided', 'MISSING_FILE');
        return;
      }

      const storage = getStorage();
      const timestamp = Date.now();
      const filename = `${timestamp}.jpg`;
      const key = path.posix.join('screenshots', deviceId, filename);

      // Store screenshot
      await storage.storeFile(key, req.file.buffer);

      // Keep only the last 10 screenshots — delete oldest
      const prefix = path.posix.join('screenshots', deviceId);
      const files = (await storage.listFiles(prefix))
        .filter((f) => f.endsWith('.jpg') || f.endsWith('.png'))
        .sort(); // lexicographic sort = chronological for timestamp names

      if (files.length > 10) {
        const toDelete = files.slice(0, files.length - 10);
        for (const old of toDelete) {
          try {
            await storage.deleteFile(path.posix.join(prefix, old));
          } catch {
            // Ignore delete errors
          }
        }
      }

      sendSuccess(res, {
        filename,
        size: req.file.size,
        timestamp,
      });
    } catch (err: any) {
      if (err.message === 'Only JPEG and PNG files are allowed') {
        sendError(res, 400, err.message, 'INVALID_FILE_TYPE');
        return;
      }
      sendError(res, 500, 'Failed to upload screenshot', 'INTERNAL_ERROR');
    }
  }
);

/**
 * GET /api/devices/:id/screenshots
 * List screenshots for a device (JWT auth).
 */
router.get(
  '/:id/screenshots',
  authUser,
  async (req: Request, res: Response, _next: NextFunction) => {
    try {
      const deviceId = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;

      // Validate UUID format to prevent path traversal
      if (!UUID_REGEX.test(deviceId)) {
        sendError(res, 400, 'Invalid device ID format', 'INVALID_ID');
        return;
      }

      const storage = getStorage();
      const prefix = path.posix.join('screenshots', deviceId);

      const fileNames = (await storage.listFiles(prefix))
        .filter((f) => f.endsWith('.jpg') || f.endsWith('.png'))
        .sort()
        .reverse(); // newest first

      const result = await Promise.all(
        fileNames.map(async (filename) => {
          const key = path.posix.join(prefix, filename);
          const stat = await storage.getFileStats(key);
          // Extract timestamp from filename (e.g. "1700000000000.jpg")
          const tsMatch = filename.match(/^(\d+)\./);
          const timestamp = tsMatch ? parseInt(tsMatch[1], 10) : stat.mtime.getTime();

          return {
            filename,
            size: stat.size,
            timestamp,
            url: `/storage/screenshots/${deviceId}/${filename}`,
          };
        })
      );

      sendSuccess(res, result);
    } catch {
      sendError(res, 500, 'Failed to list screenshots', 'INTERNAL_ERROR');
    }
  }
);

export default router;
