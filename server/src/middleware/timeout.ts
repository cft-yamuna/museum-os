import type { Request, Response, NextFunction } from 'express';

/**
 * Request timeout middleware.
 * Sends a 408 response if the request takes longer than the specified duration.
 */
export function requestTimeout(ms: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          error: 'Request timeout',
          code: 'TIMEOUT',
        });
      }
    }, ms);

    res.on('finish', () => clearTimeout(timer));
    next();
  };
}
