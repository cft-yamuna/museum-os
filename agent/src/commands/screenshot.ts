import { z } from 'zod';
import WebSocket from 'ws';
import type { CommandHandler } from '../lib/types.js';
import type { Logger } from '../lib/logger.js';

const DEFAULT_CDP_PORT = 9222;
const CDP_TIMEOUT_MS = 10_000;

const ScreenshotArgsSchema = z.object({
  serverUrl: z.string().url().optional(),
  deviceId: z.string().uuid().optional(),
  apiKey: z.string().min(1).optional(),
  quality: z.number().int().min(1).max(100).optional(),
  cdpPort: z.number().int().min(1).max(65535).optional(),
});

export function registerScreenshotCommands(
  register: (command: string, handler: CommandHandler) => void,
  logger: Logger,
  defaultServerUrl?: string,
  defaultDeviceId?: string,
  defaultApiKey?: string
): void {
  register('kiosk:screenshot', async (args) => {
    const parsed = ScreenshotArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      throw new Error(
        `Invalid screenshot args: ${parsed.error.issues.map((i) => i.message).join(', ')}`
      );
    }

    const serverUrl = parsed.data.serverUrl ?? defaultServerUrl;
    const deviceId = parsed.data.deviceId ?? defaultDeviceId;
    const apiKey = parsed.data.apiKey ?? defaultApiKey;
    const quality = parsed.data.quality ?? 75;
    const cdpPort = parsed.data.cdpPort ?? DEFAULT_CDP_PORT;

    logger.info(`Capturing screenshot via CDP on port ${cdpPort}`);

    // Step 1: Get the page's debugger WebSocket URL
    const targets = await fetchCdpTargets(cdpPort);
    const page = targets.find((t: { type: string }) => t.type === 'page');
    if (!page) {
      throw new Error(
        'No Chrome page found via CDP. Is Chrome running with --remote-debugging-port?'
      );
    }

    // Step 2: Validate and capture via CDP WebSocket
    validateCdpWsUrl(page.webSocketDebuggerUrl, cdpPort);
    const buffer = await captureViaCdp(page.webSocketDebuggerUrl, quality);
    logger.info(`Screenshot captured: ${buffer.length} bytes`);

    // Step 3: Upload if server info provided
    if (serverUrl && deviceId && apiKey) {
      try {
        const uploaded = await uploadScreenshot(
          buffer,
          serverUrl,
          deviceId,
          apiKey,
          logger
        );
        return { captured: true, size: buffer.length, uploaded };
      } catch (uploadErr) {
        const errMsg =
          uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
        logger.error('Screenshot upload failed:', errMsg);
        return {
          captured: true,
          size: buffer.length,
          uploaded: false,
          error: errMsg,
        };
      }
    }

    return { captured: true, size: buffer.length, uploaded: false };
  });
}

/**
 * Validate that the CDP WebSocket URL points to localhost on the expected port.
 */
function validateCdpWsUrl(url: string, expectedPort: number): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid CDP WebSocket URL');
  }
  if (parsed.protocol !== 'ws:') {
    throw new Error(`Unexpected CDP WebSocket protocol: ${parsed.protocol}`);
  }
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error(
      `CDP WebSocket URL points to non-local host: ${parsed.hostname}`
    );
  }
  const port = parsed.port ? parseInt(parsed.port, 10) : 80;
  if (port !== expectedPort) {
    throw new Error(`CDP WebSocket URL port mismatch: ${port} vs ${expectedPort}`);
  }
}

/**
 * Fetch the list of CDP targets (pages, workers, etc.) from Chrome.
 */
async function fetchCdpTargets(
  port: number
): Promise<Array<{ type: string; webSocketDebuggerUrl: string }>> {
  const url = `http://127.0.0.1:${port}/json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) {
    throw new Error(`CDP targets request failed: HTTP ${response.status}`);
  }
  return response.json() as Promise<
    Array<{ type: string; webSocketDebuggerUrl: string }>
  >;
}

/**
 * Connect to a CDP page via WebSocket and capture a screenshot.
 * Returns the raw JPEG buffer.
 */
function captureViaCdp(wsUrl: string, quality: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const ws = new WebSocket(wsUrl);

    const timer = setTimeout(() => {
      settle(() => {
        ws.close();
        reject(new Error('CDP screenshot timed out'));
      });
    }, CDP_TIMEOUT_MS);

    ws.on('error', (err) => {
      settle(() => reject(new Error(`CDP WebSocket error: ${err.message}`)));
    });

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Page.captureScreenshot',
          params: { format: 'jpeg', quality },
        })
      );
    });

    ws.on('message', (data: Buffer | string) => {
      try {
        const raw = typeof data === 'string' ? data : data.toString('utf-8');
        const msg = JSON.parse(raw);
        if (msg.id === 1 && msg.result?.data) {
          settle(() => {
            ws.close();
            resolve(Buffer.from(msg.result.data, 'base64'));
          });
        } else if (msg.id === 1 && msg.error) {
          settle(() => {
            ws.close();
            reject(new Error(`CDP error: ${msg.error.message}`));
          });
        }
        // Ignore unrelated CDP events — keep timer running
      } catch (err) {
        settle(() => {
          ws.close();
          reject(err instanceof Error ? err : new Error(String(err)));
        });
      }
    });
  });
}

/**
 * Upload screenshot to server via multipart/form-data.
 */
async function uploadScreenshot(
  buffer: Buffer,
  serverUrl: string,
  deviceId: string,
  apiKey: string,
  logger: Logger
): Promise<boolean> {
  const endpoint = `/api/devices/${deviceId}/screenshot`;
  const url = `${serverUrl}${endpoint}`;
  const filename = `screenshot-${Date.now()}.jpg`;

  logger.info(`Uploading screenshot to ${url}`);

  const blob = new Blob([buffer], { type: 'image/jpeg' });
  const formData = new FormData();
  formData.append('screenshot', blob, filename);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Upload failed: HTTP ${response.status} ${body}`);
  }

  logger.info('Screenshot uploaded successfully');
  return true;
}
