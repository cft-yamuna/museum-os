import net from 'net';
import crypto from 'crypto';

interface PJLinkResponse {
  success: boolean;
  data?: string;
  error?: string;
}

interface ProjectorStatus {
  power: 'on' | 'off' | 'cooling' | 'warmup' | 'unknown';
  lampHours: number | null;
  errorStatus: string | null;
  inputSource: string | null;
}

/**
 * PJLink Class 1 client for projector control.
 * Protocol: TCP port 4352, text-based command/response.
 */
export class PJLinkClient {
  private host: string;
  private port: number;
  private password: string | null;

  constructor(host: string, port = 4352, password: string | null = null) {
    this.host = host;
    this.port = port;
    this.password = password;
  }

  /**
   * Send a PJLink command and get the response.
   * Handles authentication if password is set.
   */
  private async sendCommand(command: string): Promise<PJLinkResponse> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let buffer = '';
      let authPrefix = '';
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({ success: false, error: 'Connection timeout' });
      }, 5000);

      socket.connect(this.port, this.host, () => {
        // PJLink greeting will come in 'data' event
      });

      socket.on('data', (data) => {
        buffer += data.toString();

        // Handle PJLink greeting (authentication)
        if (buffer.startsWith('PJLINK ')) {
          const parts = buffer.split('\r');
          const greeting = parts[0];

          if (greeting === 'PJLINK 0') {
            // No authentication required
            authPrefix = '';
          } else if (greeting.startsWith('PJLINK 1 ')) {
            // Authentication required - MD5 challenge
            const challenge = greeting.substring(9).trim();
            if (this.password) {
              const hash = crypto
                .createHash('md5')
                .update(challenge + this.password)
                .digest('hex');
              authPrefix = hash;
            } else {
              clearTimeout(timeout);
              socket.destroy();
              resolve({ success: false, error: 'Authentication required but no password set' });
              return;
            }
          }

          // Send the command
          const fullCommand = authPrefix + command + '\r';
          socket.write(fullCommand);
          buffer = '';
          return;
        }

        // Handle command response
        if (buffer.includes('\r')) {
          clearTimeout(timeout);
          const response = buffer.split('\r')[0].trim();

          // Check for auth error
          if (response === 'PJLINK ERRA') {
            socket.destroy();
            resolve({ success: false, error: 'Authentication failed' });
            return;
          }

          // Parse response: %1XXXX=value
          const eqIdx = response.indexOf('=');
          if (eqIdx !== -1) {
            const value = response.substring(eqIdx + 1);
            if (value === 'ERR1') {
              resolve({ success: false, error: 'Undefined command' });
            } else if (value === 'ERR2') {
              resolve({ success: false, error: 'Out of parameter' });
            } else if (value === 'ERR3') {
              resolve({ success: false, error: 'Unavailable time' });
            } else if (value === 'ERR4') {
              resolve({ success: false, error: 'Projector failure' });
            } else {
              resolve({ success: true, data: value });
            }
          } else {
            resolve({ success: true, data: response });
          }
          socket.destroy();
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        resolve({ success: false, error: `Connection error: ${err.message}` });
      });

      socket.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  async powerOn(): Promise<PJLinkResponse> {
    return this.sendCommand('%1POWR 1');
  }

  async powerOff(): Promise<PJLinkResponse> {
    return this.sendCommand('%1POWR 0');
  }

  async queryPower(): Promise<PJLinkResponse> {
    return this.sendCommand('%1POWR ?');
  }

  async selectInput(input: string): Promise<PJLinkResponse> {
    return this.sendCommand(`%1INPT ${input}`);
  }

  async muteOn(): Promise<PJLinkResponse> {
    return this.sendCommand('%1AVMT 31');
  }

  async muteOff(): Promise<PJLinkResponse> {
    return this.sendCommand('%1AVMT 30');
  }

  async queryLamp(): Promise<PJLinkResponse> {
    return this.sendCommand('%1LAMP ?');
  }

  async queryError(): Promise<PJLinkResponse> {
    return this.sendCommand('%1ERST ?');
  }

  async queryName(): Promise<PJLinkResponse> {
    return this.sendCommand('%1NAME ?');
  }

  /**
   * Get full projector status by querying power, lamp, and error.
   */
  async getStatus(): Promise<ProjectorStatus> {
    const [powerRes, lampRes, errorRes] = await Promise.all([
      this.queryPower(),
      this.queryLamp(),
      this.queryError(),
    ]);

    let power: ProjectorStatus['power'] = 'unknown';
    if (powerRes.success && powerRes.data) {
      const map: Record<string, ProjectorStatus['power']> = {
        '0': 'off',
        '1': 'on',
        '2': 'cooling',
        '3': 'warmup',
      };
      power = map[powerRes.data] || 'unknown';
    }

    let lampHours: number | null = null;
    if (lampRes.success && lampRes.data) {
      // Format: "hours 0" or "hours 1" (1=lamp on)
      const parts = lampRes.data.split(' ');
      lampHours = parseInt(parts[0], 10) || null;
    }

    return {
      power,
      lampHours,
      errorStatus: errorRes.success ? errorRes.data || null : errorRes.error || null,
      inputSource: null,
    };
  }
}

/**
 * Get a PJLink client for a device.
 * Expects device.config to have: { pjlink_host, pjlink_port?, pjlink_password? }
 */
export function getPJLinkClient(config: Record<string, unknown>): PJLinkClient | null {
  const host = config.pjlink_host as string;
  if (!host) return null;
  const port = (config.pjlink_port as number) || 4352;
  const password = (config.pjlink_password as string) || null;
  return new PJLinkClient(host, port, password);
}
