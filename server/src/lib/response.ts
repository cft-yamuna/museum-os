import type { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({
    success: true,
    data,
  });
}

export function sendCreated<T>(res: Response, data: T): void {
  sendSuccess(res, data, 201);
}

export function sendNoContent(res: Response): void {
  res.status(204).end();
}

export function sendError(res: Response, statusCode: number, message: string, code?: string): void {
  res.status(statusCode).json({
    success: false,
    error: message,
    code: code || 'ERROR',
  });
}
