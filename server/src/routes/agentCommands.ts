/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';
import { sendSuccess, sendError } from '../lib/response.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { authUser, requireRole } from '../middleware/auth.js';
import { sendCommandToAgent, sendCommandToAgentWithResponse, getAgentClient } from '../services/agentWs.js';
import { createAuditLog } from '../services/auditLog.js';

const router = Router();

// --- Helpers ---

/**
 * Check that the authenticated user has access to the given site.
 * Super admins always pass; others must have the site in their site_ids.
 */
function checkSiteAccess(req: Express.Request & { user?: { role: string; site_ids: string[] | null } }, siteId: string): void {
  if (req.user?.role === 'super_admin') return;
  if (!req.user?.site_ids || !req.user.site_ids.includes(siteId)) {
    throw new ForbiddenError('No access to this site');
  }
}

// --- Command Allowlist ---
const ALLOWED_COMMANDS = [
  'ping', 'status', 'restart-agent',
  'system:shutdown', 'system:reboot', 'system:suspend',
  'system:shutdown-delayed', 'system:cancel-shutdown',
  'display:brightness', 'display:power', 'display:rotate',
  'display:volume', 'display:info',
  'kiosk:launch', 'kiosk:kill', 'kiosk:navigate',
  'kiosk:restart', 'kiosk:status',
  'kiosk:screenshot',
  'network:ping', 'network:bandwidth', 'network:dns', 'network:interfaces',
  'maintenance:cleanup', 'maintenance:status',
  'agent:update', 'agent:rollback', 'agent:update-status',
  'serial:close',
  'serial:bridge-start', 'serial:bridge-stop', 'serial:bridge-status',
  'sensor:status', 'sensor:enable', 'sensor:disable',
] as const;

const healthQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
});

const agentCommandSchema = z.object({
  command: z.enum(ALLOWED_COMMANDS),
  args: z.record(z.unknown()).optional(),
  timeout: z.number().int().positive().max(120_000).optional(),
  await_response: z.boolean().optional(),
});

/**
 * POST /api/devices/:id/agent-command
 * Send a command to a device's agent via WebSocket.
 * Set await_response=true to wait for the agent's response (up to timeout).
 */
router.post(
  '/:id/agent-command',
  authUser,
  requireRole(['super_admin', 'site_admin', 'operator']),
  validateBody(agentCommandSchema),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      // Verify device exists
      const device = await db('devices').where({ id }).first();
      if (!device) {
        throw new NotFoundError('Device', id);
      }

      // Verify user has access to this device's site
      checkSiteAccess(req, device.site_id);

      // Check agent is connected
      if (!device.agent_connected) {
        sendError(res, 400, 'Agent is not connected to this device', 'AGENT_NOT_CONNECTED');
        return;
      }

      const { command, args, timeout, await_response } = req.body as {
        command: string;
        args?: Record<string, unknown>;
        timeout?: number;
        await_response?: boolean;
      };

      const commandId = crypto.randomUUID();
      const wsMessage = {
        type: 'command',
        payload: { id: commandId, command, args, timeout },
        timestamp: Date.now(),
      };

      // Fire-and-forget audit log
      createAuditLog({
        userId: req.user?.id,
        siteId: device.site_id,
        action: 'device.agent_command',
        entityType: 'device',
        entityId: id,
        details: { commandId, command, args, await_response: !!await_response },
      });

      if (await_response) {
        try {
          const result = await sendCommandToAgentWithResponse(
            id,
            commandId,
            wsMessage,
            timeout || 30_000
          );
          sendSuccess(res, { commandId, command, delivered: true, result });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Command failed';
          sendError(res, 504, message, 'COMMAND_TIMEOUT');
        }
      } else {
        const delivered = sendCommandToAgent(id, wsMessage);
        sendSuccess(res, { commandId, command, delivered });
      }
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/devices/:id/agent
 * Get agent info for a device (version, capabilities, connected status).
 */
router.get(
  '/:id/agent',
  authUser,
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const device = await db('devices')
        .select('id', 'site_id', 'agent_connected', 'agent_version', 'last_health', 'config')
        .where({ id })
        .first();

      if (!device) {
        throw new NotFoundError('Device', id);
      }

      // Verify user has access to this device's site
      checkSiteAccess(req, device.site_id);

      const agentClient = getAgentClient(id);
      const lastHealth = typeof device.last_health === 'string'
        ? JSON.parse(device.last_health)
        : device.last_health;
      const capabilities = agentClient?.capabilities
        || (device.config as Record<string, unknown>)?.agentCapabilities
        || null;

      sendSuccess(res, {
        agent_connected: device.agent_connected,
        agent_version: device.agent_version || agentClient?.agentVersion || null,
        capabilities,
        last_health: lastHealth || null,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/devices/:id/health
 * Get health history for a device (from device_health table).
 */
router.get(
  '/:id/health',
  authUser,
  validateQuery(healthQuerySchema),
  async (req, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const db = getDb();

      const device = await db('devices').where({ id }).select('id', 'site_id').first();
      if (!device) {
        throw new NotFoundError('Device', id);
      }

      // Verify user has access to this device's site
      checkSiteAccess(req, device.site_id);

      const limit = (req.query as { limit?: number }).limit ?? 100;

      const rows = await db('device_health')
        .where({ device_id: id })
        .orderBy('recorded_at', 'desc')
        .limit(limit)
        .select('cpu_usage', 'mem_percent', 'disk_percent', 'cpu_temp', 'uptime', 'recorded_at');

      sendSuccess(res, rows);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
