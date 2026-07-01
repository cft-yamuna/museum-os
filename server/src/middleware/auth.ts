/// <reference path="../types/express.d.ts" />
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env.js';
import { getDb } from '../lib/db.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
import { isTokenRevoked } from '../services/tokenRevocation.js';

interface JWTPayload {
  id: string;
  email: string;
  name: string;
  role: string;
  site_ids: string[] | null;
  jti?: string;
  iat?: number;
}

/**
 * Authentication middleware for admin UI requests.
 * Extracts and verifies JWT from Authorization header.
 * Checks invalidated JTIs and token_valid_after timestamp.
 * Attaches decoded user to req.user.
 */
export async function authUser(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedError('Authorization header missing');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedError('Invalid Authorization header format');
    }

    const token = parts[1];

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;

      // Check if this token's jti has been invalidated (rotation)
      if (decoded.jti && await isTokenRevoked(decoded.jti)) {
        throw new UnauthorizedError('Token has been revoked');
      }

      // Check if token was issued before a password change
      const db = getDb();
      const user = await db('users')
        .select('token_valid_after')
        .where({ id: decoded.id })
        .first();

      if (user && user.token_valid_after && decoded.iat) {
        const validAfterTs = Math.floor(new Date(user.token_valid_after).getTime() / 1000);
        if (decoded.iat < validAfterTs) {
          throw new UnauthorizedError('Token invalidated by password change');
        }
      }

      req.user = decoded;
      next();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        throw err;
      }
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token expired');
      } else if (err instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token');
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

/**
 * Authentication middleware for display client (App01) requests.
 * Extracts and validates API key from Authorization header.
 * Attaches device info to req.device.
 */
export async function authDevice(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedError('Authorization header missing');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedError('Invalid Authorization header format');
    }

    const apiKey = parts[1];
    const db = getDb();

    // Look up device by API key stored in config->>'apiKey'
    const device = await db('devices')
      .whereRaw("config->>'apiKey' = ?", [apiKey])
      .first();

    if (!device) {
      throw new UnauthorizedError('Invalid API key');
    }

    req.device = {
      id: device.id,
      site_id: device.site_id,
      type: device.type,
      config: device.config || {},
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Combined auth middleware: accepts either admin JWT or device API key.
 * Use on endpoints that need to be accessible from both admin UI and display clients.
 * Attaches req.user (JWT) or req.device (API key) depending on which succeeds.
 */
export async function authUserOrDevice(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Try JWT auth first (quick check: valid JWT tokens are longer and contain dots)
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next(new UnauthorizedError('Authorization header missing'));
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return next(new UnauthorizedError('Invalid Authorization header format'));
  }

  const token = parts[1];

  // Try JWT first
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    if (decoded.jti && await isTokenRevoked(decoded.jti)) {
      throw new jwt.JsonWebTokenError('revoked');
    }
    const db = getDb();
    const user = await db('users')
      .select('token_valid_after')
      .where({ id: decoded.id })
      .first();
    if (user && user.token_valid_after && decoded.iat) {
      const validAfterTs = Math.floor(new Date(user.token_valid_after).getTime() / 1000);
      if (decoded.iat < validAfterTs) {
        throw new jwt.JsonWebTokenError('expired by password change');
      }
    }
    req.user = decoded;
    return next();
  } catch (_jwtErr) {
    // JWT failed — try device API key
  }

  // Try device API key
  try {
    const db = getDb();
    const device = await db('devices')
      .whereRaw("config->>'apiKey' = ?", [token])
      .first();
    if (!device) {
      return next(new UnauthorizedError('Invalid token'));
    }
    req.device = {
      id: device.id,
      site_id: device.site_id,
      type: device.type,
      config: device.config || {},
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Role-based access control middleware.
 * Must be used after authUser.
 * Checks if req.user.role is in the allowed roles array.
 */
export function requireRole(roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User not authenticated');
      }

      if (!roles.includes(req.user.role)) {
        throw new ForbiddenError('Insufficient role permissions');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Ranked RBAC (curato-style). A single ordering spans both the curato role
 * names and curato's, so routes can express "operator or above" instead of
 * enumerating every role. Higher number = more privilege.
 *
 *   readonly(0) < auditor(1) < curator/content_manager(2)
 *     < operator(3) < site_admin(4) < owner/super_admin(5)
 */
export const ROLE_RANK: Record<string, number> = {
  readonly: 0,
  auditor: 1,
  curator: 2,
  content_manager: 2,
  operator: 3,
  site_admin: 4,
  owner: 5,
  super_admin: 5,
};

export function roleRank(role: string | undefined): number {
  return role && role in ROLE_RANK ? ROLE_RANK[role] : -1;
}

/**
 * Allow any authenticated user whose role ranks at or above `minRole`.
 * Use after authUser. Complements the exact-match requireRole().
 */
export function requireMinRole(minRole: string) {
  const min = ROLE_RANK[minRole] ?? Number.MAX_SAFE_INTEGER;
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user) throw new UnauthorizedError('User not authenticated');
      if (roleRank(req.user.role) < min) {
        throw new ForbiddenError(`Requires '${minRole}' role or higher`);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Site access control middleware.
 * Must be used after authUser.
 * For super_admin: always allow.
 * For others: check if site_id is in user's site_ids array.
 */
export function requireSiteAccess(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    // Super admin has access to all sites
    if (req.user.role === 'super_admin') {
      next();
      return;
    }

    // Get site_id from params or body
    const siteId = req.params.site_id || req.params.siteId || req.body.site_id;
    if (!siteId) {
      throw new ForbiddenError('Site ID not provided');
    }

    // Check if user has access to this site
    if (!req.user.site_ids || !req.user.site_ids.includes(siteId)) {
      throw new ForbiddenError('No access to this site');
    }

    next();
  } catch (err) {
    next(err);
  }
}
