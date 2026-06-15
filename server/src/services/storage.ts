import path from 'path';
import crypto from 'crypto';
import type { Readable } from 'stream';
import { normalizeStorageFilename } from '../lib/contentFiles.js';
import { getStorage } from './storageBackend.js';

/**
 * Get the relative storage key for content files
 */
export function getStorageKey(
  siteId: string,
  contentType: string,
  contentId: string,
  version: number,
  filename: string
): string {
  const safeFilename = normalizeStorageFilename(filename);
  return path.posix.join(siteId, contentType, contentId, `v${version}`, safeFilename);
}

/** @deprecated Use getStorageKey — kept for backward compat */
export const getStoragePath = getStorageKey;

/**
 * Store a file and return metadata
 */
export async function storeFile(params: {
  siteId: string;
  contentType: string;
  contentId: string;
  version: number;
  filename: string;
  buffer: Buffer;
}): Promise<{ filePath: string; fileSize: number; hash: string }> {
  const { siteId, contentType, contentId, version, filename, buffer } = params;
  const key = getStorageKey(siteId, contentType, contentId, version, filename);

  await getStorage().storeFile(key, buffer);
  const hash = computeHash(buffer);

  return {
    filePath: key,
    fileSize: buffer.length,
    hash,
  };
}

/**
 * Store a file from a stream (useful for large uploads with S3)
 */
export async function storeFileFromStream(key: string, stream: Readable): Promise<void> {
  await getStorage().storeFile(key, stream);
}

/**
 * Delete a file
 */
export async function deleteFile(relativePath: string): Promise<void> {
  await getStorage().deleteFile(relativePath);
}

/**
 * Get a readable stream for serving a file
 */
export async function getFileStream(relativePath: string): Promise<Readable> {
  return getStorage().getFileStream(relativePath);
}

/**
 * Get file statistics
 */
export async function getFileStats(
  relativePath: string
): Promise<{ size: number; mtime: Date }> {
  return getStorage().getFileStats(relativePath);
}

/**
 * Get disk space information
 */
export async function getDiskSpace(): Promise<{
  freeGB: number;
  totalGB: number;
  usedPercent: number;
}> {
  return getStorage().getDiskSpace();
}

/**
 * Compute SHA-256 hash of a buffer
 */
export function computeHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
