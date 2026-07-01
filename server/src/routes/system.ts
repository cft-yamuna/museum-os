/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sendSuccess } from '../lib/response.js';
import { authUser, requireRole } from '../middleware/auth.js';
import { env } from '../lib/env.js';

const router = Router();

// Status lives in bind-mounted storage so it survives the container restart that
// the rebuild causes, and so the host-side relay can write to the same file the
// server reads.
const STATUS_FILE = path.join(env.STORAGE_PATH, 'update-status.json');

type UpdateStage =
  | 'idle'
  | 'requested'
  | 'fetching'
  | 'pulling'
  | 'building'
  | 'done'
  | 'error';

interface UpdateStatus {
  stage: UpdateStage;
  requestId: string | null;
  message?: string;
  startedAt?: string;
  updatedAt?: string;
  gitBefore?: string;
  gitAfter?: string;
  error?: string;
}

function readStatus(): UpdateStatus {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8')) as UpdateStatus;
    if (parsed && typeof parsed.stage === 'string') return parsed;
  } catch {
    // No status file yet, or it's unreadable — treat as idle.
  }
  return { stage: 'idle', requestId: null };
}

function writeStatus(status: UpdateStatus): void {
  try {
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
    fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8');
  } catch (err) {
    console.error('[SELFUPDATE] Failed to write status file:', err);
  }
}

/**
 * POST /api/system/update
 * Trigger a self-update. The server runs inside the curato-app container and
 * can't git-pull or rebuild itself, so it records a "requested" status and logs
 * a marker that the host-side update-relay.ps1 watcher acts on:
 *   git fetch -> git pull --ff-only -> docker compose up -d --build curato-app
 * The relay then writes progress back to the same status file.
 */
router.post('/update', authUser, requireRole(['super_admin']), (_req, res) => {
  const requestId = crypto.randomUUID();
  const now = new Date().toISOString();

  writeStatus({
    stage: 'requested',
    requestId,
    message: 'Update requested — waiting for the host update relay to pick it up.',
    startedAt: now,
    updatedAt: now,
  });

  // The host relay tails `docker logs curato-app` for this exact marker.
  console.log(`[SELFUPDATE] requested id=${requestId}`);

  sendSuccess(res, { requestId, status: readStatus() });
});

/**
 * GET /api/system/update/status
 * Current update status, written by the host relay into bind-mounted storage.
 */
router.get('/update/status', authUser, requireRole(['super_admin']), (_req, res) => {
  sendSuccess(res, readStatus());
});

export default router;
