import { z } from 'zod';
import type { Logger } from '../lib/logger.js';
import type { Updater } from '../services/updater.js';
import type { WsClient } from '../services/websocket.js';
import type { CommandHandler, Identity } from '../lib/types.js';

type RegisterFn = (name: string, handler: CommandHandler) => void;

// --- Zod Schemas ---
// Accept either a download ID or a full/relative URL for backwards compat.
const UpdateArgsSchema = z.object({
  url: z.string().min(1).optional(),
  downloadId: z.string().min(1).optional(),
  version: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid checksum format (expected SHA256 hex)'),
});

export function registerUpdateCommands(
  register: RegisterFn,
  updater: Updater,
  wsClient: WsClient,
  logger: Logger,
  serverUrl: string,
  identity?: Identity
): void {
  // Build download URL from the agent's own serverUrl — the only source of truth
  // for how to reach the server from this device.
  const baseUrl = serverUrl.replace(/\/+$/, '');

  register('agent:update', async (args) => {
    const parsed = UpdateArgsSchema.safeParse(args ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues;
      const checksumIssue = issues.find((i) => i.path.includes('checksum'));
      if (checksumIssue) {
        throw new Error('Invalid checksum format (expected SHA256 hex)');
      }
      throw new Error('Missing required args: version, checksum, and url or downloadId');
    }

    const { version, checksum, downloadId } = parsed.data;

    // Always build the URL from our own serverUrl.
    // If downloadId is provided, use it directly. Otherwise extract from url path.
    let url: string;
    if (downloadId) {
      url = `${baseUrl}/api/agent/download/${downloadId}`;
    } else if (parsed.data.url) {
      // Extract just the path portion (strip any host that doesn't match us)
      const rawUrl = parsed.data.url;
      const pathMatch = rawUrl.match(/\/api\/agent\/download\/(.+)/);
      if (pathMatch) {
        url = `${baseUrl}/api/agent/download/${pathMatch[1]}`;
      } else if (rawUrl.startsWith('/')) {
        url = `${baseUrl}${rawUrl}`;
      } else {
        url = rawUrl; // absolute URL, use as-is (legacy fallback)
      }
    } else {
      throw new Error('Missing required args: url or downloadId');
    }

    const sendStatus = (phase: string, detail?: Record<string, unknown>) => {
      wsClient.send({
        type: 'agent:update_status',
        payload: { phase, version, ...detail },
        timestamp: Date.now(),
      });
    };

    try {
      sendStatus('downloading');
      logger.info(`Downloading update from: ${url}`);
      const downloadHeaders: Record<string, string> = {};
      if (identity?.apiKey) {
        downloadHeaders['Authorization'] = `Bearer ${identity.apiKey}`;
      }
      const filePath = await updater.download(url, downloadHeaders);

      sendStatus('verifying');
      const valid = await updater.verify(filePath, checksum);
      if (!valid) {
        sendStatus('error', { error: 'Checksum verification failed' });
        throw new Error('Checksum verification failed');
      }

      sendStatus('installing');
      await updater.install(filePath, version);

      updater.cleanDownloads();

      sendStatus('restarting');
      logger.info(`Update to v${version} complete. Restarting...`);

      setTimeout(() => process.exit(0), 2000);

      return { success: true, version, restarting: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updater.resetStatus();
      sendStatus('error', { error: message });
      logger.error(`Update failed: ${message}`);
      throw new Error(`Update failed: ${message}`);
    }
  });

  register('agent:rollback', async () => {
    try {
      await updater.rollback();
      logger.info('Rollback complete. Restarting...');
      setTimeout(() => process.exit(0), 2000);
      return { success: true, restarting: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Rollback failed: ${message}`);
      throw new Error(`Rollback failed: ${message}`);
    }
  });

  register('agent:update-status', async () => {
    const status = updater.getStatus();
    return { ...status } as Record<string, unknown>;
  });
}
