type MessageHandler = (event: string, data: unknown) => void;

class AdminWebSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private messageQueue: Record<string, unknown>[] = [];
  private deviceSubscriptions = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxDelay = 30000;
  private token: string | null = null;

  connect(token: string): void {
    this.token = token;
    this.doConnect();
  }

  private doConnect(): void {
    if (!this.token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    this.ws = new WebSocket(`${protocol}//${host}/ws/admin?token=${this.token}`);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.resubscribeDevices();
      this.flushQueue();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const eventName = msg.event || msg.type;
        const data = msg.payload || msg.data || msg;

        // Notify specific handlers
        const specific = this.handlers.get(eventName);
        if (specific) {
          specific.forEach((h) => h(eventName, data));
        }

        // Notify wildcard handlers
        const wildcard = this.handlers.get('*');
        if (wildcard) {
          wildcard.forEach((h) => h(eventName, data));
        }
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
    }, this.reconnectDelay);
  }

  disconnect(): void {
    this.token = null;
    this.messageQueue = [];
    this.deviceSubscriptions.clear();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  on(event: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  send(data: Record<string, unknown>): void {
    const type = typeof data.type === 'string' ? data.type : '';
    const payload = data.payload;
    const deviceId = payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).deviceId
      : undefined;

    if (type === 'subscribe:device' && typeof deviceId === 'string' && deviceId) {
      this.deviceSubscriptions.add(deviceId);
    }
    if (type === 'unsubscribe:device' && typeof deviceId === 'string' && deviceId) {
      this.deviceSubscriptions.delete(deviceId);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return;
    }

    this.messageQueue.push(data);
    if (this.messageQueue.length > 100) {
      this.messageQueue.shift();
    }
  }

  private flushQueue(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    while (this.messageQueue.length > 0) {
      const nextMessage = this.messageQueue.shift();
      if (nextMessage) {
        this.ws.send(JSON.stringify(nextMessage));
      }
    }
  }

  private resubscribeDevices(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    for (const deviceId of this.deviceSubscriptions) {
      this.ws.send(JSON.stringify({
        type: 'subscribe:device',
        payload: { deviceId },
      }));
    }
  }
}

export const adminWs = new AdminWebSocket();
