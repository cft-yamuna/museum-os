/**
 * Samsung SSSP (Samsung Smart Signage Platform) REST API client.
 *
 * Samsung commercial displays (Tizen-based) expose a local HTTP REST API
 * for device management. This client wraps common operations:
 * device info, power, brightness, screenshot, and URL launcher.
 *
 * Reference: Samsung SSSP API Developer Guide
 */

interface SSSPResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface SSSPDeviceInfo {
  modelName: string | null;
  firmwareVersion: string | null;
  serialNumber: string | null;
  macAddress: string | null;
  ipAddress: string | null;
  powerState: 'on' | 'standby' | 'unknown';
}

export class SSSPClient {
  private host: string;
  private port: number;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(host: string, port = 8001, timeoutMs = 10_000) {
    this.host = host;
    this.port = port;
    this.baseUrl = `http://${host}:${port}/api/v2`;
    this.timeoutMs = timeoutMs;
  }

  /**
   * GET request to the SSSP API with timeout.
   */
  private async request<T>(path: string): Promise<SSSPResponse<T>> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      const url = `${this.baseUrl}${path}`;

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json() as T;
      return { success: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `SSSP request failed: ${message}` };
    }
  }

  /**
   * POST/PUT request to the SSSP API.
   */
  private async command<T>(
    path: string,
    method: 'POST' | 'PUT' = 'POST',
    body?: Record<string, unknown>
  ): Promise<SSSPResponse<T>> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      const url = `${this.baseUrl}${path}`;

      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json() as T;
      return { success: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `SSSP command failed: ${message}` };
    }
  }

  // --- Device Info ---

  async getDeviceInfo(): Promise<SSSPResponse<SSSPDeviceInfo>> {
    const res = await this.request<Record<string, unknown>>('/device/info');
    if (!res.success || !res.data) return { success: false, error: res.error };

    const d = res.data;
    return {
      success: true,
      data: {
        modelName: (d.modelName as string) || null,
        firmwareVersion: (d.firmwareVersion as string) || null,
        serialNumber: (d.serialNumber as string) || null,
        macAddress: (d.macAddress as string) || null,
        ipAddress: (d.ipAddress as string) || null,
        powerState: parsePowerState(d.powerState as string),
      },
    };
  }

  // --- Power Control ---

  async powerOn(): Promise<SSSPResponse> {
    return this.command('/device/power', 'POST', { power: 'on' });
  }

  async powerOff(): Promise<SSSPResponse> {
    return this.command('/device/power', 'POST', { power: 'off' });
  }

  async restart(): Promise<SSSPResponse> {
    return this.command('/device/reboot', 'POST');
  }

  // --- Brightness ---

  async getBrightness(): Promise<SSSPResponse<{ level: number }>> {
    return this.request<{ level: number }>('/device/brightness');
  }

  async setBrightness(level: number): Promise<SSSPResponse> {
    const clamped = Math.max(0, Math.min(100, Math.round(level)));
    return this.command('/device/brightness', 'PUT', { level: clamped });
  }

  // --- URL Launcher ---

  async setUrl(url: string): Promise<SSSPResponse> {
    return this.command('/app/url-launcher', 'POST', { url });
  }

  async getUrl(): Promise<SSSPResponse<{ url: string }>> {
    return this.request<{ url: string }>('/app/url-launcher');
  }

  // --- Screenshot ---

  async getScreenshot(): Promise<SSSPResponse<Buffer>> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      const url = `${this.baseUrl}/device/screenshot`;

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const arrayBuffer = await response.arrayBuffer();
      return { success: true, data: Buffer.from(arrayBuffer) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Screenshot failed: ${message}` };
    }
  }

  getHost(): string {
    return this.host;
  }

  getPort(): number {
    return this.port;
  }
}

// --- Helpers ---

function parsePowerState(val: string | undefined): 'on' | 'standby' | 'unknown' {
  if (!val) return 'unknown';
  const lower = val.toLowerCase();
  if (lower === 'on' || lower === '1') return 'on';
  if (lower === 'off' || lower === 'standby' || lower === '0') return 'standby';
  return 'unknown';
}

/**
 * Get an SSSP client for a device.
 * Expects device.config to have: { sssp_host, sssp_port? }
 */
export function getSSSPClient(config: Record<string, unknown>): SSSPClient | null {
  const host = config.sssp_host as string;
  if (!host) return null;
  const port = (config.sssp_port as number) || 8001;
  return new SSSPClient(host, port);
}
