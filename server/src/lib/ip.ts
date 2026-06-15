import type { Request } from 'express';

/**
 * Extract the client IP address from the request.
 * Checks x-forwarded-for header first, then falls back to req.ip.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    // x-forwarded-for can be comma-separated; take the first (client) IP
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}
