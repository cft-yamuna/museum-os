'use client';

export interface LocalDisplayEvent<T = unknown> {
  type: string;
  payload: T;
  timestamp: number;
}

type EventCallback = (event: LocalDisplayEvent) => void;

const LOCAL_WS_URL = 'ws://127.0.0.1:3402';

export class LocalEventManager {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private closed = false;

  connect(): void {
    this.closed = false;
    if (typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(LOCAL_WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as LocalDisplayEvent;
        this.dispatch(parsed);
      } catch {
        // Ignore malformed local messages
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      try {
        this.ws?.close();
      } catch {
        // Ignore cleanup errors
      }
    };
  }

  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore cleanup errors
      }
      this.ws = null;
    }
  }

  on(eventType: string, callback: EventCallback): void {
    let set = this.listeners.get(eventType);
    if (!set) {
      set = new Set();
      this.listeners.set(eventType, set);
    }
    set.add(callback);
  }

  off(eventType: string, callback: EventCallback): void {
    const set = this.listeners.get(eventType);
    if (!set) return;
    set.delete(callback);
    if (set.size === 0) {
      this.listeners.delete(eventType);
    }
  }

  private dispatch(event: LocalDisplayEvent): void {
    const exact = this.listeners.get(event.type);
    if (exact) {
      exact.forEach((callback) => {
        callback(event);
      });
    }

    const wildcard = this.listeners.get('*');
    if (wildcard) {
      wildcard.forEach((callback) => {
        callback(event);
      });
    }
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;

    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

export const localEventManager = new LocalEventManager();
