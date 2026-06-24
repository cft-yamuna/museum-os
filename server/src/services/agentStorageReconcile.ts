import path from 'path';
import { createHash } from 'crypto';
import type { Knex } from 'knex';
import { getStorage } from './storageBackend.js';

const UPDATES_PREFIX = 'agent-updates';

export interface ReconcileResult {
  /** agent_versions rows examined */
  checked: number;
  /** rows whose missing file was repointed to an existing tarball */
  repaired: number;
  /** rows still pointing at a missing file (no tarball in storage to repair with) */
  unresolved: number;
}

/**
 * Reconcile agent_versions rows with the tarballs actually present in storage.
 *
 * A JSON DB import restores the agent_versions ROWS but not the binary tarballs
 * in server/storage/agent-updates, so a row can end up referencing a file that
 * doesn't exist on this server -> kiosk downloads fail with FILE_MISSING.
 *
 * Agent tarballs are platform-agnostic (auto-deploy-agent uploads the SAME build
 * file for every platform), so any tarball present in storage can back any row.
 * This repoints rows whose file is missing at a tarball that does exist
 * (recomputing checksum + size so the record stays consistent). Rows that can't
 * be repaired (no tarball in storage at all) are left untouched and reported.
 *
 * Best-effort and idempotent: when everything already lines up it does nothing.
 */
export async function reconcileAgentVersionStorage(db: Knex): Promise<ReconcileResult> {
  const storage = getStorage();
  const rows = await db('agent_versions').select('id', 'filename', 'checksum', 'file_size');
  const result: ReconcileResult = { checked: rows.length, repaired: 0, unresolved: 0 };
  if (rows.length === 0) return result;

  const keyFor = (filename: string): string => path.posix.join(UPDATES_PREFIX, filename);

  const existsCache = new Map<string, boolean>();
  const fileThere = async (filename: string): Promise<boolean> => {
    if (existsCache.has(filename)) return existsCache.get(filename)!;
    const ok = await storage.fileExists(keyFor(filename));
    existsCache.set(filename, ok);
    return ok;
  };

  // Pick a "donor": any tarball that actually exists in storage and can back a
  // broken row. Prefer one already referenced by a row (its stored checksum is
  // known-good); otherwise scan the folder for an orphaned tarball.
  let donor: { filename: string; checksum: string; file_size: number } | null = null;

  for (const r of rows) {
    if (await fileThere(r.filename)) {
      donor = { filename: r.filename, checksum: r.checksum, file_size: Number(r.file_size) };
      break;
    }
  }

  if (!donor) {
    let entries: string[] = [];
    try {
      entries = await storage.listFiles(UPDATES_PREFIX);
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      const filename = entry.split('/').pop() ?? '';
      if (!filename.endsWith('.tar.gz') && !filename.endsWith('.tgz')) continue;
      if (await fileThere(filename)) {
        donor = await describeStoredFile(filename);
        break;
      }
    }
  }

  for (const r of rows) {
    if (await fileThere(r.filename)) continue; // row is fine
    if (!donor) {
      result.unresolved++;
      continue;
    }
    await db('agent_versions')
      .where({ id: r.id })
      .update({
        filename: donor.filename,
        checksum: donor.checksum,
        file_size: donor.file_size,
      });
    result.repaired++;
  }

  return result;
}

/** Compute checksum + size for a tarball already in storage. */
async function describeStoredFile(
  filename: string
): Promise<{ filename: string; checksum: string; file_size: number }> {
  const stream = await getStorage().getFileStream(path.posix.join(UPDATES_PREFIX, filename));
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of stream) {
    const buf = chunk as Buffer;
    hash.update(buf);
    size += buf.length;
  }
  return { filename, checksum: hash.digest('hex'), file_size: size };
}
