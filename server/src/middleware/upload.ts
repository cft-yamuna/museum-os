import multer from 'multer';
import {
  MIME_TYPE_MAP,
  getContentTypeFromMime,
  resolveUploadType,
} from '../lib/contentFiles.js';

/**
 * Map of supported MIME types to content types
 */
export { MIME_TYPE_MAP };

/**
 * Get content type from MIME type
 */
export { getContentTypeFromMime, resolveUploadType };

/**
 * Create a multer upload middleware with specified options
 */
export function createUploadMiddleware(options?: {
  maxSize?: number;
}): multer.Multer {
  const maxSize = options?.maxSize || 2 * 1024 * 1024 * 1024; // 2GB default

  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxSize,
    },
    fileFilter: (_req, file, callback) => {
      try {
        // Validate against MIME type first, then fall back to the file extension.
        resolveUploadType({
          filename: file.originalname,
          mimeType: file.mimetype,
        });
        callback(null, true);
      } catch (err) {
        callback(err as Error);
      }
    },
  });
}
