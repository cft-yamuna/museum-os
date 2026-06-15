import fs from 'fs';
import path from 'path';
import type { Readable } from 'stream';
import type { StorageBackend, FileStats, DiskSpace } from './storageBackend.js';
import { NotFoundError } from '../lib/errors.js';

export class FsBackend implements StorageBackend {
  constructor(private readonly basePath: string) {}

  private resolve(key: string): string {
    const fullPath = path.resolve(this.basePath, key);
    const base = path.resolve(this.basePath);
    if (!fullPath.startsWith(base + path.sep) && fullPath !== base) {
      throw new Error(`Path traversal detected: ${key}`);
    }
    return fullPath;
  }

  async storeFile(key: string, data: Buffer | Readable): Promise<void> {
    const fullPath = this.resolve(key);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

    if (Buffer.isBuffer(data)) {
      await fs.promises.writeFile(fullPath, data);
    } else {
      const writeStream = fs.createWriteStream(fullPath);
      await new Promise<void>((resolve, reject) => {
        data.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        data.on('error', reject);
      });
    }
  }

  async getFileStream(key: string): Promise<Readable> {
    const fullPath = this.resolve(key);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundError('File', key);
    }
    return fs.createReadStream(fullPath);
  }

  async getFileStreamRange(key: string, start: number, end: number): Promise<Readable> {
    const fullPath = this.resolve(key);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundError('File', key);
    }
    return fs.createReadStream(fullPath, { start, end });
  }

  async deleteFile(key: string): Promise<void> {
    const fullPath = this.resolve(key);
    try {
      await fs.promises.unlink(fullPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  async getFileStats(key: string): Promise<FileStats> {
    const fullPath = this.resolve(key);
    try {
      const stats = await fs.promises.stat(fullPath);
      return { size: stats.size, mtime: stats.mtime };
    } catch (err: any) {
      if (err.code === 'ENOENT') throw new NotFoundError('File', key);
      throw err;
    }
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await fs.promises.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const dirPath = this.resolve(prefix);
    try {
      const entries = await fs.promises.readdir(dirPath);
      return entries;
    } catch (err: any) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
  }

  async getDiskSpace(): Promise<DiskSpace> {
    return new Promise((resolve, reject) => {
      fs.statfs(this.basePath, (err, stats) => {
        if (err) {
          reject(err);
          return;
        }
        const totalBytes = stats.blocks * stats.bsize;
        const freeBytes = stats.bfree * stats.bsize;
        const usedBytes = totalBytes - freeBytes;
        resolve({
          freeGB: freeBytes / (1024 ** 3),
          totalGB: totalBytes / (1024 ** 3),
          usedPercent: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0,
        });
      });
    });
  }
}
