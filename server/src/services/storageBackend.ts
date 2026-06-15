import type { Readable } from 'stream';

export interface FileStats {
  size: number;
  mtime: Date;
}

export interface DiskSpace {
  freeGB: number;
  totalGB: number;
  usedPercent: number;
}

export interface StorageBackend {
  storeFile(key: string, data: Buffer | Readable): Promise<void>;
  getFileStream(key: string): Promise<Readable>;
  getFileStreamRange(key: string, start: number, end: number): Promise<Readable>;
  deleteFile(key: string): Promise<void>;
  getFileStats(key: string): Promise<FileStats>;
  fileExists(key: string): Promise<boolean>;
  listFiles(prefix: string): Promise<string[]>;
  getDiskSpace(): Promise<DiskSpace>;
}

let _storage: StorageBackend | null = null;

export function getStorage(): StorageBackend {
  if (!_storage) {
    throw new Error('Storage backend not initialized. Call initStorage() first.');
  }
  return _storage;
}

export async function initStorage(): Promise<void> {
  const { env } = await import('../lib/env.js');

  if (env.S3_ENDPOINT) {
    const { S3Backend } = await import('./s3Backend.js');
    _storage = new S3Backend({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION!,
      bucket: env.S3_BUCKET!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    });
    console.log(`  Storage:     S3 (${env.S3_BUCKET})`);
  } else {
    const { FsBackend } = await import('./fsBackend.js');
    _storage = new FsBackend(env.STORAGE_PATH);
    console.log(`  Storage:     local (${env.STORAGE_PATH})`);
  }
}

/** Reset storage singleton (for testing only) */
export function _resetStorage(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('_resetStorage cannot be called in production');
  }
  _storage = null;
}
