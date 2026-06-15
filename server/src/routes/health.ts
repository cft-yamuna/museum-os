import { Router } from 'express';
import { checkDbConnection } from '../lib/db.js';
import { sendSuccess } from '../lib/response.js';
import { authUser, requireRole } from '../middleware/auth.js';
import { getConnectedCount } from '../services/displayWs.js';
import { getAdminCount } from '../services/adminWs.js';
import { isMqttConnected } from '../services/mqttClient.js';
import { getActiveJobCount } from '../services/scheduler.js';
import { getDiskSpace } from '../services/storage.js';
import os from 'os';
import fs from 'fs';
import { env } from '../lib/env.js';

const router = Router();

import { execSync } from 'child_process';

// Read version from package.json at startup
let serverVersion = '1.0.0';
let gitHash = 'unknown';
let buildDate = 'unknown';
try {
  const pkgPath = new URL('../../package.json', import.meta.url);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  serverVersion = pkg.version || '1.0.0';
} catch {
  // Fall back to default version
}
try {
  gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8', timeout: 3000 }).trim();
  buildDate = execSync('git log -1 --format=%cd --date=short', { encoding: 'utf-8', timeout: 3000 }).trim();
} catch {
  // Not in a git repo or git not available
}

/**
 * GET /api/health
 * Public health check endpoint.
 * Returns basic server status, uptime, database connectivity, and memory usage.
 */
router.get('/', async (_req, res) => {
  const dbConnected = await checkDbConnection();
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();

  sendSuccess(res, {
    status: dbConnected ? 'ok' : 'degraded',
    uptime: Math.floor(uptime),
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
    version: serverVersion,
    gitHash,
    buildDate,
  });
});

/**
 * GET /api/health/detailed
 * Protected detailed health check endpoint (super_admin only).
 * Returns extended diagnostics including MQTT, WebSocket, disk, and scheduler status.
 */
router.get('/detailed', authUser, requireRole(['super_admin']), async (_req, res) => {
  const dbConnected = await checkDbConnection();
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();

  // Check storage disk space (works for both FS and S3 backends)
  let diskSpace = { free: 0, total: 0 };
  try {
    const space = await getDiskSpace();
    diskSpace = {
      free: Math.round(space.freeGB),
      total: Math.round(space.totalGB),
    };
  } catch {
    // Ignore disk space errors
  }

  sendSuccess(res, {
    status: dbConnected ? 'ok' : 'degraded',
    uptime: Math.floor(uptime),
    timestamp: new Date().toISOString(),
    version: serverVersion,
    gitHash,
    buildDate,
    node: process.version,
    platform: os.platform(),
    services: {
      database: dbConnected ? 'connected' : 'disconnected',
      mqtt: isMqttConnected() ? 'connected' : 'disconnected',
      websocket: {
        display: getConnectedCount(),
        admin: getAdminCount(),
      },
    },
    scheduler: {
      activeJobs: getActiveJobCount(),
    },
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
    disk: {
      storagePath: env.STORAGE_PATH,
      freeGB: diskSpace.free,
      totalGB: diskSpace.total,
    },
    system: {
      hostname: os.hostname(),
      cpus: os.cpus().length,
      totalMemoryGB: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      freeMemoryGB: Math.round(os.freemem() / 1024 / 1024 / 1024),
      loadAvg: os.loadavg(),
    },
  });
});

export default router;
