import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';
import { ZodError } from 'zod';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    const messages = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: messages,
    });
    return;
  }

  // Known application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Multer file size errors
  if (err.message && err.message.includes('File too large')) {
    res.status(413).json({
      success: false,
      error: 'File too large',
      code: 'FILE_TOO_LARGE',
    });
    return;
  }

  // Unknown errors
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    code: 'INTERNAL_ERROR',
  });
}
