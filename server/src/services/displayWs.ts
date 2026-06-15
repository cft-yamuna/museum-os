import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { URL } from 'url';
import { getDb } from '../lib/db.js';
import { pushToDeviceSubscribers, pushToAdmins } from './adminWs.js';

// --- Types ---
interface DisplayClient {
  deviceId: string;
  siteId: string;
  ws: WebSocket;
  instanceId?: string;
  templateType?: string;
  lastPing: number;
}

interface WsMessage {
  type: string;
  payload?: Record<string, unknown>;
  timestamp: number;
}

// --- State ---
const clients = new Map<string, DisplayClient>();
let wss: WebSocketServer | null = null;
let pingInterval: NodeJS.Timeout | null = null;

// --- Public API ---

/**
 * Initialize display WebSocket on the given HTTP server.
 * Handles path /ws
 */
export function initDisplayWs(server: Server): void {
  wss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade - only for /ws path (not /ws/admin)
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(
      request.url || '',
      `http://${request.headers.host}`
    ).pathname;

    if (pathname === '/ws') {
      wss!.handleUpgrade(request, socket, head, (ws) => {
        wss!.emit('connection', ws, request);
      });
    }
    // Don't handle other paths - let admin WS handle /ws/admin
  });

  wss.on('connection', (ws, request) => {
    handleConnection(ws, request);
  });

  // Ping/pong keepalive every 30s
  pingInterval = setInterval(() => {
    const now = Date.now();
    for (const [deviceId, client] of clients) {
      if (now - client.lastPing > 60_000) {
        // No pong received in 60s, terminate
        console.log(
          `[DisplayWS] Terminating stale connection: ${deviceId}`
        );
        client.ws.terminate();
        clients.delete(deviceId);
        continue;
      }
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }
  }, 30_000);

  console.log('  Display WS:  ws://localhost:PORT/ws');
}

/**
 * Shutdown the WebSocket server
 */
export function closeDisplayWs(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  for (const client of clients.values()) {
    client.ws.close(1001, 'Server shutting down');
  }
  clients.clear();
  if (wss) {
    wss.close();
    wss = null;
  }
}

/**
 * Send an event to a specific device.
 * Returns true if the device is connected and message was sent.
 */
export function sendToDevice(deviceId: string, event: WsMessage): boolean {
  const client = clients.get(deviceId);
  if (!client || client.ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  client.ws.send(JSON.stringify(event));
  return true;
}

/**
 * Broadcast an event to multiple devices.
 * Returns the number of devices that received the message.
 */
export function broadcastToDevices(
  deviceIds: string[],
  event: WsMessage
): number {
  let sent = 0;
  for (const deviceId of deviceIds) {
    if (sendToDevice(deviceId, event)) {
      sent++;
    }
  }
  return sent;
}

/**
 * Broadcast an event to all devices assigned to a specific app.
 * Queries the DB for devices with the given app_id, then sends to each.
 */
export async function broadcastToApp(appId: string, event: WsMessage): Promise<number> {
  try {
    const db = getDb();
    const devices = await db('devices').where({ app_id: appId }).select('id');
    const deviceIds = devices.map((d: { id: string }) => d.id);
    return broadcastToDevices(deviceIds, event);
  } catch (err) {
    console.error(`[DisplayWS] broadcastToApp error for ${appId}:`, err);
    return 0;
  }
}

/**
 * Broadcast to all connected devices at a specific site.
 */
export function broadcastToSite(siteId: string, event: WsMessage): number {
  let sent = 0;
  for (const client of clients.values()) {
    if (client.siteId === siteId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(event));
      sent++;
    }
  }
  return sent;
}

/**
 * Get the count of connected display clients.
 */
export function getConnectedCount(): number {
  return clients.size;
}

/**
 * Get list of connected device IDs.
 */
export function getConnectedDevices(): string[] {
  return Array.from(clients.keys());
}

// --- Internal ---

async function handleConnection(
  ws: WebSocket,
  request: InstanceType<typeof import('http').IncomingMessage>
): Promise<void> {
  // Authenticate via API key in query string: ?apiKey=xxx
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
    }

    // Track connection
    const client: DisplayClient = {
      deviceId,
      siteId,
      ws,
      lastPing: Date.now(),
    };
    clients.set(deviceId, client);

    // Update device status
    await db('devices')
      .where({ id: deviceId })
      .update({
        status: 'online',
        last_seen: db.fn.now(),
        updated_at: db.fn.now(),
      });

    console.log(
      `[DisplayWS] Device connected: ${deviceId} (${device.display_name || device.mac_address})`
    );

    // Notify admins that device is online
    pushToAdmins({
      type: 'device:status',
      payload: { deviceId, status: 'online', displayName: device.display_name || device.mac_address },
      timestamp: Date.now(),
    }, siteId);

    // Handle pong
    ws.on('pong', () => {
      const c = clients.get(deviceId);
      if (c) {
        c.lastPing = Date.now();
      }
    });

    // Handle messages from display client
    ws.on('message', (data) => {
      try {
        const msg: WsMessage = JSON.parse(data.toString());
        handleClientMessage(deviceId, msg);
      } catch (err) {
        console.error(`[DisplayWS] Invalid message from ${deviceId}:`, err);
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      clients.delete(deviceId);
      console.log(`[DisplayWS] Device disconnected: ${deviceId}`);
      // Don't immediately mark offline - the offline detector will handle it
      // after the 2-minute grace period
    });

    ws.on('error', (err) => {
      console.error(`[DisplayWS] Error from ${deviceId}:`, err);
      clients.delete(deviceId);
    });

    // Send welcome/ack
    ws.send(
      JSON.stringify({
        type: 'connected',
        payload: { deviceId, message: 'Connected to Museum OS' },
        timestamp: Date.now(),
      })
    );
  } catch (err) {
    console.error('[DisplayWS] Connection error:', err);
    ws.close(4500, 'Server error');
  }
}

function handleClientMessage(deviceId: string, msg: WsMessage): void {
  switch (msg.type) {
    case 'register': {
      const client = clients.get(deviceId);
      if (client && msg.payload) {
        client.instanceId = msg.payload.instanceId as string;
        client.templateType = msg.payload.templateType as string;
      }
      break;
    }
    case 'heartbeat': {
      // Update last_seen (lightweight, no await needed for fire-and-forget)
      const db = getDb();
      db('devices')
        .where({ id: deviceId })
        .update({ last_seen: db.fn.now() })
        .catch((err: unknown) =>
          console.error(
            `[DisplayWS] Heartbeat DB error: ${deviceId}`,
            err
          )
        );
      break;
    }
    case 'error': {
      console.warn(
        `[DisplayWS] Device error from ${deviceId}:`,
        msg.payload
      );
      // Forward error to admins subscribed to this device
      const errorClient = clients.get(deviceId);
      if (errorClient) {
        pushToDeviceSubscribers(deviceId, {
          type: 'device:alert',
          payload: { deviceId, type: 'device_error', ...(msg.payload || {}) },
          timestamp: Date.now(),
        });
      }
      break;
    }
    case 'display:revision-rendered': {
      if (msg.payload) {
        pushToDeviceSubscribers(deviceId, {
          type: 'display:revision-rendered',
          payload: { deviceId, ...msg.payload },
          timestamp: Date.now(),
        });
      }
      break;
    }
    default:
      console.log(
        `[DisplayWS] Unknown message type from ${deviceId}: ${msg.type}`
      );
  }
}
