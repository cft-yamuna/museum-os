/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import multer from 'multer';
import { getDb } from '../lib/db.js';
import { sendSuccess } from '../lib/response.js';
import { authUser, requireRole } from '../middleware/auth.js';
import {
  buildDbJsonExportPayload,
  importDbJsonPayload,
} from '../services/dbJsonTransfer.js';
import { createAuditLog } from '../services/auditLog.js';
import { getClientIp } from '../lib/ip.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
  fileFilter: (_req, file, cb) => {
    const isJsonMime = file.mimetype === 'application/json' || file.mimetype === 'text/json';
    const isJsonName = file.originalname.toLowerCase().endsWith('.json');
    if (isJsonMime || isJsonName) {
      cb(null, true);
      return;
    }
    cb(new Error('Only JSON files are allowed'));
  },
});

router.get(
  '/export',
  authUser,
  requireRole(['super_admin']),
  async (req, res, next) => {
    try {
      const payload = await buildDbJsonExportPayload(getDb());
      createAuditLog({
        userId: req.user?.id,
        action: 'system.db_json_export',
        details: { table_count: payload.tableOrder.length },
        ipAddress: getClientIp(req),
      });
      sendSuccess(res, payload);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/import',
  authUser,
  requireRole(['super_admin']),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new Error('JSON file is required');
      }

      const parsed = JSON.parse(req.file.buffer.toString('utf8')) as Record<string, unknown>;
      await importDbJsonPayload(getDb(), parsed);

      createAuditLog({
        userId: req.user?.id,
        action: 'system.db_json_import',
        details: { filename: req.file.originalname, size: req.file.size },
        ipAddress: getClientIp(req),
      });

      sendSuccess(res, {
        imported: true,
        filename: req.file.originalname,
        size: req.file.size,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
