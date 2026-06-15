import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { URL } from 'url';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env.js';

// --- Types ---
interface AdminClient {
  userId: string;
  email: string;
  role: string;
  siteIds: string[] | null;
  ws: WebSocket;
  subscriptions: Set<string>; // device IDs the admin is watching
  lastPing: number;
}

interface AdminEvent {
  type: string;
  payload?: Record<string, unknown>;
  timestamp: number;
}

// --- State ---
const adminClients = new Map<string, AdminClient>(); // keyed by a unique connection ID
let wss: WebSocketServer | null = null;
let pingInterval: NodeJS.Timeout | null = null;
let connectionCounter = 0;

// --- Public API ---

/**
 * Initialize admin WebSocket on the given HTTP server.
 * Handles path /ws/admin
 */
export function initAdminWs(server: Server): void {
  wss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade for /ws/admin path
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

    if (pathname === '/ws/admin') {
      wss!.handleUpgrade(request, socket, head, (ws) => {
        wss!.emit('connection', ws, request);
      });
    }
    // Don't handle /ws - that's for display WS
    // Don't destroy socket for unknown paths - just ignore
  });

  wss.on('connection', (ws, request) => {
    handleConnection(ws, request);
  });

  // Ping/pong keepalive every 30s
  pingInterval = setInterval(() => {
    const now = Date.now();
    for (const [connId, client] of adminClients) {
      if (now - client.lastPing > 60_000) {
        console.log(`[AdminWS] Terminating stale admin connection: ${connId}`);
        client.ws.terminate();
        adminClients.delete(connId);
        continue;
      }
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }
  }, 30_000);

  console.log('  Admin WS:    ws://localhost:PORT/ws/admin');
}

/**
 * Shutdown the admin WebSocket server.
 */
export function closeAdminWs(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  for (const client of adminClients.values()) {
    client.ws.close(1001, 'Server shutting down');
  }
  adminClients.clear();
  if (wss) {
    wss.close();
    wss = null;
  }
}

/**
 * Push an event to all connected admin clients.
 * Optionally filter by site access (admin only sees events for their sites).
 */
export function pushToAdmins(event: AdminEvent, siteId?: string): void {
  for (const client of adminClients.values()) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;

    // If siteId is provided, check admin has access to this site
    if (siteId) {
      if (client.role !== 'super_admin' && (!client.siteIds || !client.siteIds.includes(siteId))) {
        continue; // Skip - admin doesn't have access to this site
      }
    }

    client.ws.send(JSON.stringify(event));
  }
}

/**
 * Push an event to admins who are subscribed to a specific device.
 */
export function pushToDeviceSubscribers(deviceId: string, event: AdminEvent): void {
  for (const client of adminClients.values()) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    if (client.subscriptions.has(deviceId)) {
      client.ws.send(JSON.stringify(event));
    }
  }
}

/**
 * Get count of connected admin clients.
 */
export function getAdminCount(): number {
  return adminClients.size;
}

// --- Internal ---

function handleConnection(ws: WebSocket, request: { url?: string; headers: { host?: string } }): void {
  // Authenticate via JWT in query string: ?token=xxx
  const url = new URL(request.url || '', `http://${request.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(4001, 'JWT token required');
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      id: string;
      email: string;
      role: string;
      site_ids: string[] | null;
    };

    const connId = `admin_${++connectionCounter}`;

    const client: AdminClient = {
      userId: decoded.id,
      email: decoded.email,
      role: decoded.role,
      siteIds: decoded.site_ids,
      ws,
      subscriptions: new Set(),
      lastPing: Date.now(),
    };
    adminClients.set(connId, client);

    console.log(`[AdminWS] Admin connected: ${decoded.email} (${connId})`);

    // Handle pong
    ws.on('pong', () => {
      const c = adminClients.get(connId);
      if (c) {
        c.lastPing = Date.now();
      }
    });

    // Handle messages from admin
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; payload?: Record<string, unknown> };
        handleAdminMessage(connId, msg);
      } catch (err) {
        console.error(`[AdminWS] Invalid message from ${connId}:`, err);
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      adminClients.delete(connId);
      console.log(`[AdminWS] Admin disconnected: ${decoded.email} (${connId})`);
    });

    ws.on('error', (err) => {
      console.error(`[AdminWS] Error from ${connId}:`, err);
      adminClients.delete(connId);
    });

    // Send welcome
    ws.send(JSON.stringify({
      type: 'connected',
      payload: { userId: decoded.id, email: decoded.email, message: 'Admin WebSocket connected' },
      timestamp: Date.now(),
    }));

  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      ws.close(4001, 'Token expired');
    } else if (err instanceof jwt.JsonWebTokenError) {
      ws.close(4001, 'Invalid token');
    } else {
      ws.close(4500, 'Server error');
    }
  }
}

function handleAdminMessage(connId: string, msg: { type: string; payload?: Record<string, unknown> }): void {
  const client = adminClients.get(connId);
  if (!client) return;

  switch (msg.type) {
    case 'subscribe:device': {
      const deviceId = msg.payload?.deviceId as string;
      if (deviceId) {
        client.subscriptions.add(deviceId);
      }
      break;
    }
    case 'unsubscribe:device': {
      const deviceId = msg.payload?.deviceId as string;
      if (deviceId) {
        client.subscriptions.delete(deviceId);
      }
      break;
    }
    default:
      console.log(`[AdminWS] Unknown message type from ${connId}: ${msg.type}`);
  }
}
