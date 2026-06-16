import fs from 'fs/promises';
import path from 'path';
import cron from 'node-cron';
import { getDb } from '../lib/db.js';
import { env } from '../lib/env.js';
import { buildDbJsonExportPayload } from './dbJsonTransfer.js';

/**
 * Local JSON backup service.
 *
 * The Docker PostgreSQL container remains the PRIMARY source of truth. This
 * service writes a periodic, human-readable JSON duplicate of all application
 * tables to a host-mounted folder (BACKUP_DIR) so the data also lives safely
 * outside Docker. Files can be restored with `npm run db:import:json`.
 */

const FILE_PREFIX = 'museumos-db-';
const FILE_EXT = '.json';
const LATEST_FILE = 'latest.json';

let task: cron.ScheduledTask | null = null;
let running = false;

/** Timestamp safe for filenames, e.g. 2026-06-16T14-30-05-123Z. */
function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

/** Remove older timestamped backups, keeping the newest BACKUP_KEEP files. */
async function pruneOldBackups(dir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }

  const backups = entries
    .filter((name) => name.startsWith(FILE_PREFIX) && name.endsWith(FILE_EXT))
    .sort(); // ISO timestamps sort chronologically

  const excess = backups.length - env.BACKUP_KEEP;
  if (excess <= 0) return;

  for (const name of backups.slice(0, excess)) {
    try {
      await fs.unlink(path.join(dir, name));
    } catch (err) {
      console.error(`[Backup] Failed to prune ${name}:`, err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Run a single backup now. Writes a timestamped file plus latest.json.
 * Returns the absolute path of the timestamped file, or null if skipped/failed.
 */
export async function runBackup(): Promise<string | null> {
  if (running) {
    console.warn('[Backup] Previous backup still running, skipping this run.');
    return null;
  }
  running = true;

  try {
    const dir = path.resolve(env.BACKUP_DIR);
    await fs.mkdir(dir, { recursive: true });

    const db = getDb();
    const payload = await buildDbJsonExportPayload(db);
    const json = JSON.stringify(payload, null, 2);

    const stamped = path.join(dir, `${FILE_PREFIX}${fileTimestamp(new Date())}${FILE_EXT}`);
    // Write to a temp file then rename so a crash never leaves a half-written backup.
    const tmp = `${stamped}.tmp`;
    await fs.writeFile(tmp, json, 'utf8');
    await fs.rename(tmp, stamped);

    // Maintain a stable "latest" pointer for easy restore/inspection.
    await fs.writeFile(path.join(dir, LATEST_FILE), json, 'utf8');

    const rowCount = payload.tableOrder.reduce(
      (sum, table) => sum + (payload.tables[table]?.length ?? 0),
      0
    );
    console.log(`[Backup] Saved ${payload.tableOrder.length} tables / ${rowCount} rows -> ${stamped}`);

    await pruneOldBackups(dir);
    return stamped;
  } catch (err) {
    console.error('[Backup] Backup failed:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    running = false;
  }
}

/** Start the scheduled local backup job (no-op if disabled or cron invalid). */
export function startBackupService(): void {
  if (!env.BACKUP_ENABLED) {
    console.log('[Backup] Disabled (BACKUP_ENABLED=false).');
    return;
  }

  if (!cron.validate(env.BACKUP_CRON)) {
    console.error(`[Backup] Invalid BACKUP_CRON "${env.BACKUP_CRON}" — backups not scheduled.`);
    return;
  }

  // Take one backup shortly after startup so a fresh deploy has a local copy.
  setTimeout(() => {
    void runBackup();
  }, 30 * 1000);

  task = cron.schedule(env.BACKUP_CRON, () => {
    void runBackup();
  });

  console.log(`[Backup] Local JSON backups enabled (cron "${env.BACKUP_CRON}", keep ${env.BACKUP_KEEP}) -> ${path.resolve(env.BACKUP_DIR)}`);
}

/** Stop the scheduled backup job (graceful shutdown). */
export function stopBackupService(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
