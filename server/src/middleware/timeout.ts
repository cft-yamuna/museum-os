import type { Request, Response, NextFunction } from 'express';

/**
 * Request timeout middleware.
 * Sends a 408 response if the request takes longer than the specified duration.
 */
export function requestTimeout(ms: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // If a more specific timeout already applied to this request (e.g. a longer
    // window for /api/db-transfer), don't stack a second, shorter timer on top.
    if (res.locals.__timeoutApplied) {
      next();
      return;
    }
    res.locals.__timeoutApplied = true;

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
    res.on('close', () => clearTimeout(timer));
    next();
  };
}
