import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Readable } from 'stream';
import type { StorageBackend, FileStats, DiskSpace } from './storageBackend.js';
import { NotFoundError } from '../lib/errors.js';

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class S3Backend implements StorageBackend {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  async storeFile(key: string, data: Buffer | Readable): Promise<void> {
    if (Buffer.isBuffer(data)) {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
      }));
    } else {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: data,
        },
      });
      await upload.done();
    }
  }

  async getFileStream(key: string): Promise<Readable> {
    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      return response.Body as Readable;
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        throw new NotFoundError('File', key);
      }
      throw err;
    }
  }

  async getFileStreamRange(key: string, start: number, end: number): Promise<Readable> {
    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: `bytes=${start}-${end}`,
      }));
      return response.Body as Readable;
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        throw new NotFoundError('File', key);
      }
      throw err;
    }
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }

  async getFileStats(key: string): Promise<FileStats> {
    try {
      const response = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      return {
        size: response.ContentLength ?? 0,
        mtime: response.LastModified ?? new Date(),
      };
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        throw new NotFoundError('File', key);
      }
      throw err;
    }
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const response = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: normalizedPrefix,
    }));

    if (!response.Contents) return [];

    return response.Contents
      .map((obj) => {
        const fullKey = obj.Key ?? '';
        // Return just the filename (strip prefix)
        return fullKey.slice(normalizedPrefix.length);
      })
      .filter((name) => name.length > 0);
  }

  async getDiskSpace(): Promise<DiskSpace> {
    // S3 has effectively unlimited storage
    return { freeGB: Infinity, totalGB: Infinity, usedPercent: 0 };
  }
}
