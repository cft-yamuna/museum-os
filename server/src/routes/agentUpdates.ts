/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto, { createHash } from 'crypto';
import { z } from 'zod';
import { sendSuccess, sendError, sendCreated } from '../lib/response.js';
import { authUser, requireRole, authDevice } from '../middleware/auth.js';
import { validateQuery, validateBody } from '../middleware/validate.js';
import { getDb } from '../lib/db.js';
import { getStorage } from '../services/storageBackend.js';
import semver from 'semver';
import { sendCommandToAgent } from '../services/agentWs.js';

const router = Router();

const UPDATES_PREFIX = 'agent-updates';

// Multer config: memory storage, 100MB max, .tar.gz only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/gzip',
      'application/x-gzip',
      'application/x-tar',
      'application/x-compressed-tar',
      'application/octet-stream',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.tar.gz') || file.originalname.endsWith('.tgz')) {
      cb(null, true);
    } else {
      cb(new Error('Only .tar.gz files are allowed'));
    }
  },
});

/**
 * POST /api/agent/upload
 * Upload a new agent update tarball (super_admin only).
 * Multipart form: file (tarball), version (string), platform (string, optional).
 */
router.post(
  '/upload',
  authUser,
  requireRole(['super_admin']),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        sendError(res, 400, 'No file provided', 'MISSING_FILE');
        return;
      }

      const version = req.body.version as string | undefined;
      if (!version || version.trim().length === 0) {
        sendError(res, 400, 'Version is required', 'MISSING_VERSION');
        return;
      }

      const platform = (req.body.platform as string) || 'linux';

      // Compute SHA256 checksum from buffer
      const checksum = createHash('sha256').update(req.file.buffer).digest('hex');

      // Generate safe filename
      const timestamp = Date.now();
      let safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      safeName = safeName.replace(/\.\./g, '').replace(/^\.+/, '');
      if (safeName.length === 0) safeName = 'agent-update.tar.gz';
      const storedFilename = `${timestamp}-${safeName}`;

      // Store in storage backend
      const key = path.posix.join(UPDATES_PREFIX, storedFilename);
      await getStorage().storeFile(key, req.file.buffer);

      // Insert into database
      const db = getDb();
      const [row] = await db('agent_versions')
        .insert({
          filename: storedFilename,
          version: version.trim(),
          platform,
          checksum,
          file_size: req.file.size,
          uploaded_by: req.user?.id,
        })
        .returning('*');

      sendCreated(res, {
        ...row,
        download_url: `/api/agent/download/${row.id}`,
      });
    } catch (err) {
      next(err);
    }
  }
);

const listQuerySchema = z.object({
  platform: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

/**
 * GET /api/agent/versions
 * List all uploaded agent versions.
 */
router.get(
  '/versions',
  authUser,
  validateQuery(listQuerySchema),
  async (req, res, next) => {
    try {
      const db = getDb();
      const platform = req.query.platform as string | undefined;
      const limit = parseInt(req.query.limit as string, 10) || 50;

      let query = db('agent_versions')
        .select(
          'id', 'filename', 'version', 'platform', 'checksum',
          'file_size', 'uploaded_by', 'created_at'
        )
        .orderBy('created_at', 'desc')
        .limit(limit);

      if (platform) {
        query = query.where({ platform });
      }

      const rows = await query;

      const versions = rows.map((row: Record<string, unknown>) => ({
        ...row,
        download_url: `/api/agent/download/${row.id}`,
      }));

      sendSuccess(res, versions);
    } catch (err) {
      next(err);
    }
  }
);

const checkUpdateSchema = z.object({
  current_version: z.string().min(1),
  platform: z.string().optional(),
});

/**
 * GET /api/agent/check-update?current_version=1.0.0&platform=linux
 * Device-auth endpoint: agent polls this to check if a newer version exists.
 * Returns the latest version if newer than current_version, or null.
 */
router.get(
  '/check-update',
  // Accept either JWT (admin/setup) or device API key
  (req, res, next) => {
    authUser(req, res, (err) => {
      if (err) {
        authDevice(req, res, next);
      } else {
        next();
      }
    });
  },
  validateQuery(checkUpdateSchema),
  async (req, res, next) => {
    try {
      const currentVersion = req.query.current_version as string;
      const platform = (req.query.platform as string) || 'linux';
      const db = getDb();

      const latest = await db('agent_versions')
        .where({ platform })
        .orderBy('created_at', 'desc')
        .first();

      if (!latest) {
        sendSuccess(res, { update_available: false });
        return;
      }

      const isNewer = semver.valid(latest.version) && semver.valid(currentVersion)
        ? semver.gt(latest.version, currentVersion)
        : latest.version !== currentVersion;

      if (!isNewer) {
        sendSuccess(res, { update_available: false });
        return;
      }

      sendSuccess(res, {
        update_available: true,
        version: latest.version,
        checksum: latest.checksum,
        file_size: latest.file_size,
        download_url: `/api/agent/download/${latest.id}`,
        created_at: latest.created_at,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/agent/download/:id
 * Download an agent update tarball by version ID.
 * Accepts both JWT (admin) and API key (device/agent) auth.
 */
router.get(
  '/download/:id',
  // Accept either auth method
  (req, res, next) => {
    // Try JWT first, fall back to device API key
    authUser(req, res, (err) => {
      if (err) {
        authDevice(req, res, next);
      } else {
        next();
      }
    });
  },
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const row = await db('agent_versions').where({ id }).first();
      if (!row) {
        sendError(res, 404, 'Version not found', 'NOT_FOUND');
        return;
      }

      const storage = getStorage();
      const key = path.posix.join(UPDATES_PREFIX, row.filename);

      if (!(await storage.fileExists(key))) {
        sendError(res, 404, 'File not found on disk', 'FILE_MISSING');
        return;
      }

      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${row.filename}"`);
      res.setHeader('Content-Length', row.file_size);

      const stream = await storage.getFileStream(key);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/agent/status?site_id=xxx
 * Shows all devices with current agent version vs latest available version.
 */
router.get(
  '/status',
  authUser,
  async (req, res, next) => {
    try {
      const db = getDb();
      const siteId = req.query.site_id as string | undefined;

      // Get latest versions per platform
      const latestByPlatform: Record<string, { version: string; id: string; checksum: string; created_at: string }> = {};
      for (const plat of ['linux', 'windows']) {
        const latest = await db('agent_versions')
          .where({ platform: plat })
          .orderBy('created_at', 'desc')
          .first();
        if (latest) {
          latestByPlatform[plat] = {
            version: latest.version,
            id: latest.id,
            checksum: latest.checksum,
            created_at: latest.created_at,
          };
        }
      }

      // Get all devices
      let query = db('devices')
        .select('id', 'slug', 'display_name', 'agent_version', 'agent_connected', 'status', 'last_health', 'last_seen');
      if (siteId) {
        query = query.where({ site_id: siteId });
      }
      const devices = await query.orderBy('slug', 'asc');

      const result = devices.map((d: Record<string, unknown>) => {
        const health = typeof d.last_health === 'string' ? JSON.parse(d.last_health as string) : d.last_health;
        const platform = (health as Record<string, unknown>)?.platform as string || 'windows';
        const latest = latestByPlatform[platform] || latestByPlatform['windows'] || null;
        const currentVersion = d.agent_version as string || null;
        const latestVersion = latest?.version || null;

        let updateStatus: string;
        if (!currentVersion) {
          updateStatus = 'unknown';
        } else if (!latestVersion) {
          updateStatus = 'no_release';
        } else if (currentVersion === latestVersion || (latestVersion && currentVersion && latestVersion.startsWith(currentVersion.split('+')[0]) && currentVersion.includes('+'))) {
          // Handle version+hash format
          const currentBase = currentVersion.split('+')[0];
          const latestBase = latestVersion.split('+')[0];
          updateStatus = currentBase === latestBase ? 'up_to_date' : 'update_available';
        } else {
          updateStatus = semver.valid(currentVersion) && semver.valid(latestVersion)
            ? (semver.gte(currentVersion, latestVersion) ? 'up_to_date' : 'update_available')
            : (currentVersion === latestVersion ? 'up_to_date' : 'update_available');
        }

        return {
          id: d.id,
          slug: d.slug,
          display_name: d.display_name,
          agent_connected: d.agent_connected,
          status: d.status,
          platform,
          current_version: currentVersion,
          latest_version: latestVersion,
          update_status: updateStatus,
          last_seen: d.last_seen,
        };
      });

      sendSuccess(res, {
        latest_versions: latestByPlatform,
        devices: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

const pushUpdateSchema = z.object({
  device_id: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

/**
 * POST /api/agent/push-update
 * Trigger instant agent update on a device or all connected devices.
 * Body: { device_id: "uuid" } or { all: true }
 */
router.post(
  '/push-update',
  authUser,
  requireRole(['super_admin']),
  validateBody(pushUpdateSchema),
  async (req, res, next) => {
    try {
      const { device_id, all } = req.body as { device_id?: string; all?: boolean };
      const db = getDb();

      if (!device_id && !all) {
        sendError(res, 400, 'Provide device_id or set all=true', 'MISSING_PARAMS');
        return;
      }

      // Get target devices
      let devices: Array<Record<string, unknown>>;
      if (all) {
        devices = await db('devices').where({ agent_connected: true });
      } else {
        const device = await db('devices').where({ id: device_id }).first();
        if (!device) {
          sendError(res, 404, 'Device not found', 'NOT_FOUND');
          return;
        }
        devices = [device];
      }

      const results: Array<{ id: string; slug: string; delivered: boolean; error?: string }> = [];

      for (const device of devices) {
        const deviceId = device.id as string;
        const slug = device.slug as string;
        const health = typeof device.last_health === 'string' ? JSON.parse(device.last_health as string) : device.last_health;
        const platform = (health as Record<string, unknown>)?.platform as string || 'windows';

        // Find latest version for this device's platform
        const latest = await db('agent_versions')
          .where({ platform })
          .orderBy('created_at', 'desc')
          .first();

        if (!latest) {
          results.push({ id: deviceId, slug, delivered: false, error: 'No release for platform' });
          continue;
        }

        if (!device.agent_connected) {
          results.push({ id: deviceId, slug, delivered: false, error: 'Agent not connected' });
          continue;
        }

        const commandId = crypto.randomUUID();
        const wsMessage = {
          type: 'command',
          payload: {
            id: commandId,
            command: 'agent:update',
            args: {
              downloadId: latest.id,
              url: `/api/agent/download/${latest.id}`,
              version: latest.version,
              checksum: latest.checksum,
            },
          },
          timestamp: Date.now(),
        };

        const delivered = sendCommandToAgent(deviceId, wsMessage);
        results.push({ id: deviceId, slug, delivered });
      }

      sendSuccess(res, {
        total: results.length,
        delivered: results.filter(r => r.delivered).length,
        failed: results.filter(r => !r.delivered).length,
        devices: results,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
