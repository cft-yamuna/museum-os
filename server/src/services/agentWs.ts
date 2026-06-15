import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { URL } from 'url';
import { getDb } from '../lib/db.js';
import { pushToDeviceSubscribers } from './adminWs.js';
import { publishEvent as mqttPublishEvent } from './mqttClient.js';
import { sendToDevice } from './displayWs.js';
import { normalizeMacAddress } from './deviceWake.js';

// --- Types ---
interface AgentClient {
  deviceId: string;
  siteId: string;
  ws: WebSocket;
  agentVersion?: string;
  capabilities?: Record<string, unknown>;
  lastPing: number;
}

interface WsMessage {
  type: string;
  payload?: Record<string, unknown>;
  timestamp: number;
}

interface PendingCommand {
  deviceId: string;
  resolve: (result: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

const MAX_PENDING_COMMANDS = 1000;

// --- State ---
const clients = new Map<string, AgentClient>();
const pendingCommands = new Map<string, PendingCommand>();
let wss: WebSocketServer | null = null;
let pingInterval: NodeJS.Timeout | null = null;

// --- Public API ---

export function initAgentWs(server: Server): void {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(
      request.url || '',
      `http://${request.headers.host}`
    ).pathname;

    if (pathname === '/ws/agent') {
      wss!.handleUpgrade(request, socket, head, (ws) => {
        wss!.emit('connection', ws, request);
      });
    }
    // Don't handle other paths
  });

  wss.on('connection', (ws, request) => {
    handleConnection(ws, request);
  });

  // Ping/pong keepalive every 30s
  pingInterval = setInterval(() => {
    const now = Date.now();
    for (const [deviceId, client] of clients) {
      if (now - client.lastPing > 60_000) {
        console.log(`[AgentWS] Terminating stale connection: ${deviceId}`);
        client.ws.terminate();
        clients.delete(deviceId);
        cleanupPendingCommands(deviceId);
        markDisconnected(deviceId);
        continue;
      }
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }
  }, 30_000);

  console.log('  Agent WS:    ws://localhost:PORT/ws/agent');
}

export function closeAgentWs(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  for (const [deviceId, client] of clients) {
    client.ws.close(1001, 'Server shutting down');
    cleanupPendingCommands(deviceId);
    markDisconnected(deviceId);
  }
  clients.clear();
  // Reject any remaining pending commands
  for (const [cmdId, pending] of pendingCommands) {
    clearTimeout(pending.timer);
    pending.reject(new Error('Server shutting down'));
    pendingCommands.delete(cmdId);
  }
  if (wss) {
    wss.close();
    wss = null;
  }
}

export function sendCommandToAgent(
  deviceId: string,
  command: WsMessage
): boolean {
  const client = clients.get(deviceId);
  if (!client || client.ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  client.ws.send(JSON.stringify(command));
  return true;
}

/**
 * Send a command and wait for the agent's response.
 * Returns a Promise that resolves with the command result or rejects on timeout.
 */
export function sendCommandToAgentWithResponse(
  deviceId: string,
  commandId: string,
  command: WsMessage,
  timeoutMs = 30_000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    // Enforce size limit to prevent unbounded memory growth
    if (pendingCommands.size >= MAX_PENDING_COMMANDS) {
      reject(new Error('Too many pending commands — server is overloaded, try again later'));
      return;
    }

    // Register pending BEFORE sending (prevents race condition)
    const timer = setTimeout(() => {
      pendingCommands.delete(commandId);
      reject(new Error(`Command ${commandId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingCommands.set(commandId, { deviceId, resolve, reject, timer });

    const sent = sendCommandToAgent(deviceId, command);
    if (!sent) {
      clearTimeout(timer);
      pendingCommands.delete(commandId);
      reject(new Error('Agent is not connected'));
    }
  });
}

export function getAgentConnectedDevices(): string[] {
  return Array.from(clients.keys());
}

export function getAgentClient(deviceId: string): { agentVersion?: string; capabilities?: Record<string, unknown> } | null {
  const client = clients.get(deviceId);
  if (!client) return null;
  return {
    agentVersion: client.agentVersion,
    capabilities: client.capabilities,
  };
}

// --- Internal ---

async function handleConnection(
  ws: WebSocket,
  request: { url?: string; headers: { host?: string } }
): Promise<void> {
  const url = new URL(
    request.url || '',
    `http://${request.headers.host}`
  );
  const apiKey = url.searchParams.get('apiKey');

  if (!apiKey) {
    ws.close(4001, 'API key required');
    return;
  }

  try {
    const db = getDb();
    const device = await db('devices')
      .whereRaw("config->>'apiKey' = ?", [apiKey])
      .first();

    if (!device) {
      ws.close(4001, 'Invalid API key');
      return;
    }

    const deviceId = device.id;
    const siteId = device.site_id;

    // Close existing connection for same device (replace)
    const existing = clients.get(deviceId);
    if (existing) {
      existing.ws.close(4000, 'Replaced by new connection');
      cleanupPendingCommands(deviceId);
    }

    const client: AgentClient = {
      deviceId,
      siteId,
      ws,
      lastPing: Date.now(),
    };
    clients.set(deviceId, client);

    // Mark agent connected in DB
    await db('devices')
      .where({ id: deviceId })
      .update({
        agent_connected: true,
        last_seen: db.fn.now(),
        status: 'online',
        updated_at: db.fn.now(),
      });

    console.log(
      `[AgentWS] Agent connected: ${deviceId} (${device.display_name || device.slug})`
    );

    // Notify admins
    pushToDeviceSubscribers(deviceId, {
      type: 'agent:status',
      payload: { deviceId, connected: true },
      timestamp: Date.now(),
    });

    // Handle pong
    ws.on('pong', () => {
      const c = clients.get(deviceId);
      if (c) {
        c.lastPing = Date.now();
      }
    });

    // Handle messages
    ws.on('message', (data) => {
      try {
        const msg: WsMessage = JSON.parse(data.toString());
        handleAgentMessage(deviceId, msg);
      } catch (err) {
        console.error(`[AgentWS] Invalid message from ${deviceId}:`, err);
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      clients.delete(deviceId);
      cleanupPendingCommands(deviceId);
      markDisconnected(deviceId);
      console.log(`[AgentWS] Agent disconnected: ${deviceId}`);

      pushToDeviceSubscribers(deviceId, {
        type: 'agent:status',
        payload: { deviceId, connected: false },
        timestamp: Date.now(),
      });
    });

    ws.on('error', (err) => {
      console.error(`[AgentWS] Error from ${deviceId}:`, err);
      clients.delete(deviceId);
      cleanupPendingCommands(deviceId);
      markDisconnected(deviceId);
    });

    // Send welcome
    ws.send(
      JSON.stringify({
        type: 'connected',
        payload: { deviceId, message: 'Agent connected to Museum OS' },
        timestamp: Date.now(),
      })
    );
  } catch (err) {
    console.error('[AgentWS] Connection error:', err);
    ws.close(4500, 'Server error');
  }
}

function handleAgentMessage(deviceId: string, msg: WsMessage): void {
  switch (msg.type) {
    case 'agent:register': {
      const client = clients.get(deviceId);
      if (client && msg.payload) {
        client.agentVersion = msg.payload.agentVersion as string;
        client.capabilities = (msg.payload.capabilities as Record<string, unknown>) || undefined;

        // Update agent_version and capabilities in DB (fire-and-forget)
        const db = getDb();
        const configPatch: Record<string, unknown> = {};
        if (client.capabilities) {
          configPatch.agentCapabilities = client.capabilities;
        }

        // Store detected screens from agent
        const screens = msg.payload.screens as Array<Record<string, unknown>> | undefined;
        if (screens && Array.isArray(screens) && screens.length > 0) {
          configPatch.detectedScreens = screens;
          console.log(`[AgentWS] ${deviceId} reported ${screens.length} screen(s)`);
        }

        const updates: Record<string, unknown> = {
          agent_version: client.agentVersion,
          updated_at: db.fn.now(),
        };
        if (Object.keys(configPatch).length > 0) {
          updates.config = db.raw("coalesce(config, '{}'::jsonb) || ?::jsonb", [
            JSON.stringify(configPatch),
          ]);
        }
        db('devices')
          .where({ id: deviceId })
          .update(updates)
          .then(async () => {
            // After storing screens, push existing screenMap back to agent
            // (so multi-screen resumes after agent restart)
            const device = await db('devices').where({ id: deviceId }).first();
            const devConfig = typeof device?.config === 'string'
              ? JSON.parse(device.config)
              : device?.config || {};
            const screenMap = devConfig.screenMap;

            const agentConfig: Record<string, unknown> = {
              heartbeat_interval: 60,
            };

            // Include existing screenMap so agent can resume multi-screen
            if (screenMap && Array.isArray(screenMap) && screenMap.length > 0) {
              agentConfig.screenMap = screenMap;
              agentConfig.totalScreens = screenMap.length;
              console.log(`[AgentWS] Pushing existing screenMap (${screenMap.length} entries) to ${deviceId}`);
            }

            const c = clients.get(deviceId);
            if (c && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(JSON.stringify({
                type: 'agent:config',
                payload: agentConfig,
                timestamp: Date.now(),
              }));
            }
          })
          .catch((err: unknown) =>
            console.error(`[AgentWS] Register DB error: ${deviceId}`, err)
          );
      }
      break;
    }
    case 'agent:health': {
      if (msg.payload) {
        const db = getDb();
        const network = (msg.payload.network && typeof msg.payload.network === 'object')
          ? msg.payload.network as Record<string, unknown>
          : null;
        const macAddress = normalizeMacAddress(network?.mac);
        const ipAddress = typeof network?.ip === 'string' && network.ip.trim() ? network.ip.trim() : null;

        db('devices')
          .where({ id: deviceId })
          .update({
            last_health: JSON.stringify(msg.payload),
            last_seen: db.fn.now(),
            status: 'online',
            updated_at: db.fn.now(),
          })
          .catch((err: unknown) =>
            console.error(`[AgentWS] Health DB error: ${deviceId}`, err)
          );

        if (macAddress || ipAddress) {
          const networkUpdates: Record<string, unknown> = {
            updated_at: db.fn.now(),
          };
          if (macAddress) {
            networkUpdates.mac_address = macAddress;
          }
          if (ipAddress) {
            networkUpdates.ip_address = ipAddress;
          }

          db('devices')
            .where({ id: deviceId })
            .update(networkUpdates)
            .catch((err: unknown) =>
              console.error(`[AgentWS] Network identity refresh failed: ${deviceId}`, err)
            );
        }

        // Push health to admin WS subscribers in real-time
        pushToDeviceSubscribers(deviceId, {
          type: 'agent:health',
          payload: { deviceId, ...msg.payload },
          timestamp: Date.now(),
        });
      }
      break;
    }
    case 'agent:command_ack': {
      // Agent acknowledged receipt of a command — forward to admin UI
      if (msg.payload) {
        pushToDeviceSubscribers(deviceId, {
          type: 'agent:command_ack',
          payload: { deviceId, ...msg.payload },
          timestamp: Date.now(),
        });
      }
      break;
    }
    case 'agent:command_result': {
      const commandId = msg.payload?.id as string;

      // Resolve pending command if awaited
      if (commandId && pendingCommands.has(commandId)) {
        const pending = pendingCommands.get(commandId)!;
        clearTimeout(pending.timer);
        pendingCommands.delete(commandId);
        pending.resolve(msg.payload || {});
      }

      // Always forward command result to admin subscribers
      pushToDeviceSubscribers(deviceId, {
        type: 'agent:command_result',
        payload: { deviceId, ...(msg.payload || {}) },
        timestamp: Date.now(),
      });
      break;
    }
    case 'agent:cache-refresh-result': {
      if (msg.payload) {
        pushToDeviceSubscribers(deviceId, {
          type: 'agent:cache-refresh-result',
          payload: { deviceId, ...msg.payload },
          timestamp: Date.now(),
        });
      }
      break;
    }
    case 'agent:logs': {
      if (msg.payload && Array.isArray(msg.payload.entries)) {
        const entries = msg.payload.entries as Array<{
          timestamp: string;
          level: string;
          message: string;
          source: string;
        }>;

        if (entries.length === 0) break;

        // Look up device to get site_id
        const client = clients.get(deviceId);
        if (!client) break;

        const db = getDb();

        // Bulk insert log entries (fire-and-forget)
        const rows = entries.map((entry) => ({
          device_id: deviceId,
          site_id: client.siteId,
          level: entry.level || 'info',
          message: String(entry.message).slice(0, 10000),
          source: entry.source || 'agent',
          device_timestamp: new Date(entry.timestamp).getTime() || Date.now(),
          context: JSON.stringify({}),
        }));

        db('device_logs')
          .insert(rows)
          .catch((err: unknown) =>
            console.error(`[AgentWS] Logs insert error: ${deviceId}`, err)
          );
      }
      break;
    }
    case 'serial-bridge:event': {
      // Agent's serial bridge read a character from COM port and converted it to
      // a hardware event (e.g., * → monophone:pickup, # → monophone:hangup).
      // Forward it to MQTT so the display app receives it, and to admin WS.
      if (msg.payload) {
        const controllerId = msg.payload.controllerId as string;
        const eventType = msg.payload.type as string;
        console.log(`[AgentWS] Serial bridge event from ${deviceId}: ${eventType} (controllerId: ${controllerId})`);

        // Publish to MQTT → display app picks it up
        mqttPublishEvent(controllerId, msg.payload);

        // Forward to display via WebSocket (fallback when MQTT is not connected)
        sendToDevice(deviceId, {
          type: 'hardware:event',
          payload: { deviceId, ...msg.payload },
          timestamp: Date.now(),
        });

        // Also forward to admin UI
        pushToDeviceSubscribers(deviceId, {
          type: 'hardware:event',
          payload: { deviceId, ...msg.payload },
          timestamp: Date.now(),
        });
      }
      break;
    }
    case 'presence-sensor:event': {
      // Agent's presence sensor detected a state change (Present/Clear).
      // Forward to display via WebSocket and to admin UI for analytics.
      if (msg.payload) {
        const eventType = msg.payload.type as string;
        console.log(`[AgentWS] Presence sensor event from ${deviceId}: ${eventType}`);

        // Forward to display via WebSocket
        sendToDevice(deviceId, {
          type: 'hardware:event',
          payload: { deviceId, ...msg.payload },
          timestamp: Date.now(),
        });

        // Forward to admin UI for analytics
        pushToDeviceSubscribers(deviceId, {
          type: 'hardware:event',
          payload: { deviceId, ...msg.payload },
          timestamp: Date.now(),
        });
      }
      break;
    }
    default:
      console.log(
        `[AgentWS] Unknown message type from ${deviceId}: ${msg.type}`
      );
  }
}

function cleanupPendingCommands(deviceId: string): void {
  for (const [commandId, pending] of pendingCommands) {
    if (pending.deviceId === deviceId) {
      clearTimeout(pending.timer);
      pendingCommands.delete(commandId);
      pending.reject(new Error(`Agent ${deviceId} disconnected`));
    }
  }
}

function markDisconnected(deviceId: string): void {
  const db = getDb();
  db('devices')
    .where({ id: deviceId })
    .update({
      agent_connected: false,
      updated_at: db.fn.now(),
    })
    .catch((err: unknown) =>
      console.error(`[AgentWS] Disconnect DB error: ${deviceId}`, err)
    );
}
