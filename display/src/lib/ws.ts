'use client';

import type { WSEvent } from './types';
import { config } from './config';

type EventCallback = (event: WSEvent) => void;

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

const MAX_QUEUE_SIZE = 100;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private state: ConnectionState = 'disconnected';
  private stateListeners: Set<(state: ConnectionState) => void> = new Set();
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private messageQueue: string[] = [];
  private deviceId: string = '';
  private instanceId: string = '';
  private templateType: string = '';

  connect(deviceId: string, instanceId: string, templateType: string): void {
    this.deviceId = deviceId;
    this.instanceId = instanceId;
    this.templateType = templateType;
    this.doConnect();
  }

  private doConnect(): void {
    // Clean up any existing connection before creating a new one
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch (_e) {
        // Ignore errors when closing stale socket
      }
      this.ws = null;
    }

    const newState: ConnectionState = this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting';
    this.setState(newState);

    const cfg = config();
    const wsUrl = `${cfg.wsUrl}?apiKey=${encodeURIComponent(cfg.deviceApiKey)}`;
    let socket: WebSocket;

    try {
      socket = new WebSocket(wsUrl);
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws = socket;

    socket.onopen = () => {
      console.info('[WS] Connected to', wsUrl);
      this.setState('connected');
      this.reconnectAttempts = 0;
      this.register();
      this.startHeartbeat();
      this.flushQueue();
    };

    socket.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as WSEvent;
        this.dispatch(data);
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    };

    socket.onclose = (event: CloseEvent) => {
      console.info('[WS] Connection closed. Code:', event.code, 'Reason:', event.reason);
      this.stopHeartbeat();
      this.ws = null;

      // Only reconnect if we haven't explicitly disconnected
      if (this.state !== 'disconnected') {
        this.scheduleReconnect();
      }
    };

    socket.onerror = (event: Event) => {
      console.error('[WS] WebSocket error:', event);
    };
  }

  disconnect(): void {
    this.setState('disconnected');

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch (_e) {
        // Ignore errors during cleanup
      }
      this.ws = null;
    }

    this.reconnectAttempts = 0;
  }

  on(event: string, callback: EventCallback): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback);
  }

  off(event: string, callback: EventCallback): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  onStateChange(callback: (state: ConnectionState) => void): void {
    this.stateListeners.add(callback);
  }

  offStateChange(callback: (state: ConnectionState) => void): void {
    this.stateListeners.delete(callback);
  }

  send(event: string, payload: unknown): void {
    const message = JSON.stringify({ type: event, payload, timestamp: Date.now() });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.messageQueue.push(message);
      if (this.messageQueue.length > MAX_QUEUE_SIZE) {
        this.messageQueue.shift();
      }
    }
  }

  getState(): ConnectionState {
    return this.state;
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.stateListeners.forEach((cb) => {
      cb(state);
    });
  }

  private dispatch(event: WSEvent): void {
    // Dispatch to listeners registered for this specific event type
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      typeListeners.forEach((cb) => {
        try {
          cb(event);
        } catch (err) {
          console.error('[WS] Error in event listener for', event.type, ':', err);
        }
      });
    }

    // Dispatch to wildcard listeners (listening to all events)
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach((cb) => {
        try {
          cb(event);
        } catch (err) {
          console.error('[WS] Error in wildcard listener:', err);
        }
      });
    }
  }

  private scheduleReconnect(): void {
    if (this.state === 'disconnected') {
      return;
    }

    this.setState('reconnecting');

    const maxDelay = config().reconnectMaxDelay;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), maxDelay);

    console.info(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectAttempts = this.reconnectAttempts + 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    const interval = config().heartbeatInterval;

    this.heartbeatTimer = setInterval(() => {
      this.send('heartbeat', { status: 'connected' });
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(message);
      }
    }
  }

  private register(): void {
    this.send('register', {
      deviceId: this.deviceId,
      instanceId: this.instanceId,
      templateType: this.templateType,
    });
  }
}

// Singleton export
export const wsManager = new WebSocketManager();
