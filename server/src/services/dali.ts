import net from 'net';

interface DALIResponse {
  success: boolean;
  data?: string;
  error?: string;
}

/**
 * DALI-2 TCP/IP gateway client.
 * Communicates with DALI gateways (Tridonic, Helvar) over TCP.
 *
 * Command format varies by gateway manufacturer.
 * This implements a generic protocol with JSON-based commands:
 * - { "cmd": "scene", "group": 0, "scene": 5 }
 * - { "cmd": "dim", "address": 1, "level": 75 }
 * - { "cmd": "color_temp", "address": 1, "kelvin": 4000 }
 *
 * Real gateway adapters would extend this base class.
 */
export class DALIClient {
  private host: string;
  private port: number;
  private socket: net.Socket | null = null;
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 2000;

  constructor(host: string, port = 5000) {
    this.host = host;
    this.port = port;
  }

  connect(): void {
    if (this.connected || this.socket) return;

    this.socket = new net.Socket();

    this.socket.connect(this.port, this.host, () => {
      this.connected = true;
      this.reconnectDelay = 2000;
      console.log(`[DALI] Connected to gateway at ${this.host}:${this.port}`);
    });

    this.socket.on('error', (err) => {
      console.error(`[DALI] Connection error: ${err.message}`);
    });

    this.socket.on('close', () => {
      this.connected = false;
      this.socket = null;
      this.scheduleReconnect();
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    }, this.reconnectDelay);
  }

  private async sendCommand(cmd: Record<string, unknown>): Promise<DALIResponse> {
    return new Promise((resolve) => {
      if (!this.socket || !this.connected) {
        resolve({ success: false, error: 'Not connected to DALI gateway' });
        return;
      }

      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Command timeout' });
      }, 3000);

      const onData = (data: Buffer) => {
        clearTimeout(timeout);
        this.socket?.removeListener('data', onData);
        try {
          const response = JSON.parse(data.toString());
          resolve({
            success: response.status === 'ok',
            data: response.data,
            error: response.error,
          });
        } catch {
          resolve({ success: true, data: data.toString() });
        }
      };

      this.socket.on('data', onData);
      this.socket.write(JSON.stringify(cmd) + '\n');
    });
  }

  /**
   * Activate a lighting scene.
   * @param group DALI group address (0-15)
   * @param scene Scene number (0-15)
   */
  async activateScene(group: number, scene: number): Promise<DALIResponse> {
    return this.sendCommand({ cmd: 'scene', group, scene });
  }

  /**
   * Set dimming level.
   * @param address DALI address (0-63 individual, 64+ group)
   * @param level Brightness 0-100%
   */
  async setDimLevel(address: number, level: number): Promise<DALIResponse> {
    const clampedLevel = Math.max(0, Math.min(100, level));
    return this.sendCommand({ cmd: 'dim', address, level: clampedLevel });
  }

  /**
   * Set color temperature.
   * @param address DALI address
   * @param kelvin Color temperature in Kelvin (2700-6500)
   */
  async setColorTemp(address: number, kelvin: number): Promise<DALIResponse> {
    const clamped = Math.max(2700, Math.min(6500, kelvin));
    return this.sendCommand({ cmd: 'color_temp', address, kelvin: clamped });
  }

  /**
   * Turn off all lights in a group.
   * @param group DALI group address
   */
  async groupOff(group: number): Promise<DALIResponse> {
    return this.sendCommand({ cmd: 'dim', address: 64 + group, level: 0 });
  }

  /**
   * Query fixture status.
   * @param address DALI address
   */
  async queryStatus(address: number): Promise<DALIResponse> {
    return this.sendCommand({ cmd: 'query', address });
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton registry of DALI clients by device ID
const clients = new Map<string, DALIClient>();

/**
 * Get or create a DALI client for a device.
 */
export function getDALIClient(deviceId: string, config: Record<string, unknown>): DALIClient | null {
  const host = config.dali_host as string;
  if (!host) return null;
  const port = (config.dali_port as number) || 5000;

  let client = clients.get(deviceId);
  if (client && client.isConnected()) return client;

  client = new DALIClient(host, port);
  client.connect();
  clients.set(deviceId, client);
  return client;
}

/**
 * Disconnect all DALI clients.
 */
export function disconnectAllDALI(): void {
  for (const client of clients.values()) {
    client.disconnect();
  }
  clients.clear();
}
