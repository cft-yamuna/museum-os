import path from 'path';
import { ValidationError } from './errors.js';

export const MIME_TYPE_MAP: Record<string, string> = {
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'image/svg+xml': 'image',
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
  'audio/aac': 'audio',
  'audio/mp4': 'audio',
  'audio/x-m4a': 'audio',
  'application/pdf': 'document',
  'application/zip': 'app',
};

const EXTENSION_UPLOAD_MAP: Record<string, { contentType: string; mimeType: string }> = {
  '.mp4': { contentType: 'video', mimeType: 'video/mp4' },
  '.mov': { contentType: 'video', mimeType: 'video/quicktime' },
  '.webm': { contentType: 'video', mimeType: 'video/webm' },
  '.jpg': { contentType: 'image', mimeType: 'image/jpeg' },
  '.jpeg': { contentType: 'image', mimeType: 'image/jpeg' },
  '.png': { contentType: 'image', mimeType: 'image/png' },
  '.webp': { contentType: 'image', mimeType: 'image/webp' },
  '.gif': { contentType: 'image', mimeType: 'image/gif' },
  '.svg': { contentType: 'image', mimeType: 'image/svg+xml' },
  '.mp3': { contentType: 'audio', mimeType: 'audio/mpeg' },
  '.wav': { contentType: 'audio', mimeType: 'audio/wav' },
  '.ogg': { contentType: 'audio', mimeType: 'audio/ogg' },
  '.oga': { contentType: 'audio', mimeType: 'audio/ogg' },
  '.aac': { contentType: 'audio', mimeType: 'audio/aac' },
  '.m4a': { contentType: 'audio', mimeType: 'audio/x-m4a' },
  '.pdf': { contentType: 'document', mimeType: 'application/pdf' },
  '.zip': { contentType: 'app', mimeType: 'application/zip' },
};

const GENERIC_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
]);

const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/u;

export interface ResolvedUploadType {
  contentType: string;
  filename: string;
  mimeType: string;
}

export function getContentTypeFromMime(mimeType: string): string {
  const contentType = MIME_TYPE_MAP[mimeType.toLowerCase()];

  if (!contentType) {
    throw new ValidationError(`Unsupported MIME type: ${mimeType}`);
  }

  return contentType;
}

export function extractUploadFilename(filename: string): string {
  const parts = filename.split(/[/\\]+/);
  return parts[parts.length - 1] ?? '';
}

export function validateStorageFilename(filename: string): void {
  if (filename.length === 0) {
    throw new ValidationError('Filename is required');
  }
  if (filename === '.' || filename === '..') {
    throw new ValidationError('Invalid filename');
  }
  if (filename.includes('/') || filename.includes('\\')) {
    throw new ValidationError('Invalid filename');
  }
  if (CONTROL_CHAR_RE.test(filename)) {
    throw new ValidationError('Filename contains unsupported control characters');
  }
}

export function isValidStorageFilename(filename: string): boolean {
  try {
    validateStorageFilename(filename);
    return true;
  } catch {
    return false;
  }
}

export function normalizeStorageFilename(filename: string): string {
  const normalized = extractUploadFilename(filename);
  validateStorageFilename(normalized);
  return normalized;
}

export function resolveUploadType(params: {
  filename: string;
  mimeType?: string | null;
}): ResolvedUploadType {
  const filename = normalizeStorageFilename(params.filename);
  const normalizedMimeType = (params.mimeType ?? '').toLowerCase();

  if (!GENERIC_MIME_TYPES.has(normalizedMimeType)) {
    const contentType = MIME_TYPE_MAP[normalizedMimeType];
    if (contentType) {
      return {
        contentType,
        filename,
        mimeType: normalizedMimeType,
      };
    }
  }

  const byExtension = EXTENSION_UPLOAD_MAP[path.extname(filename).toLowerCase()];
  if (byExtension) {
    return {
      contentType: byExtension.contentType,
      filename,
      mimeType: byExtension.mimeType,
    };
  }

  throw new ValidationError(`Unsupported file type: ${filename}`);
}

export function encodeFilenameForUrl(filename: string): string {
  return encodeURIComponent(filename);
}

export function getFilenameFromPath(filePath: string): string {
  return path.posix.basename(filePath);
}

export function buildContentUrl(
  siteId: string,
  contentType: string,
  contentId: string,
  version: number,
  filePath: string
): string {
  if (filePath.startsWith('/demo-media/')) {
    return filePath;
  }

  const filename = encodeFilenameForUrl(getFilenameFromPath(filePath));
  return `/storage/${siteId}/${contentType}/${contentId}/v${version}/${filename}`;
}

export function getResponseContentType(
  filename: string,
  contentTypeSegment?: string
): string {
  const ext = path.extname(filename).toLowerCase();

  switch (ext) {
    case '.mp4':
      return contentTypeSegment === 'audio' ? 'audio/mp4' : 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return contentTypeSegment === 'audio' ? 'audio/webm' : 'video/webm';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
    case '.oga':
      return 'audio/ogg';
    case '.aac':
      return 'audio/aac';
    case '.m4a':
      return 'audio/x-m4a';
    case '.pdf':
      return 'application/pdf';
    case '.zip':
      return 'application/zip';
    default:
      return 'application/octet-stream';
  }
}
