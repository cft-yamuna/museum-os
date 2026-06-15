/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { env } from '../lib/env.js';
import { UnauthorizedError } from '../lib/errors.js';
import { sendSuccess } from '../lib/response.js';
import { validateBody } from '../middleware/validate.js';
import { authUser } from '../middleware/auth.js';
import { createAuditLog } from '../services/auditLog.js';
import { getClientIp } from '../lib/ip.js';
import { revokeToken } from '../services/tokenRevocation.js';

const router = Router();

// --- Login Rate Limiter: 5 attempts per minute per IP ---
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts', code: 'RATE_LIMITED' },
});

// --- Brute Force Protection ---
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 10;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

function checkBruteForce(email: string): void {
  const attempt = loginAttempts.get(email);
  if (attempt && attempt.lockedUntil > Date.now()) {
    const remainingMinutes = Math.ceil((attempt.lockedUntil - Date.now()) / 60000);
    throw new UnauthorizedError(`Account locked. Try again in ${remainingMinutes} minutes.`);
  }
}

function recordFailedAttempt(email: string): void {
  const existing = loginAttempts.get(email);
  const attempt = existing
    ? { ...existing, count: existing.count + 1 }
    : { count: 1, lockedUntil: 0 };
  if (attempt.count >= MAX_ATTEMPTS) {
    loginAttempts.set(email, { count: 0, lockedUntil: Date.now() + LOCKOUT_DURATION });
  } else {
    loginAttempts.set(email, attempt);
  }
}

function clearAttempts(email: string): void {
  loginAttempts.delete(email);
}

// --- Schemas ---
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

// --- Routes ---

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token.
 */
router.post('/login', loginLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const db = getDb();
    const ipAddress = getClientIp(req);

    // Check brute force lockout
    checkBruteForce(email);

    // Look up user by email
    const user = await db('users')
      .where({ email })
      .first();

    if (!user) {
      recordFailedAttempt(email);
      createAuditLog({
        action: 'auth.login_failed',
        details: { email, ip_address: ipAddress, reason: 'Invalid email or password' },
        ipAddress,
      });
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check if user is active
    if (!user.is_active) {
      recordFailedAttempt(email);
      createAuditLog({
        userId: user.id,
        action: 'auth.login_failed',
        details: { email, ip_address: ipAddress, reason: 'Account is inactive' },
        ipAddress,
      });
      throw new UnauthorizedError('Account is inactive');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      recordFailedAttempt(email);
      createAuditLog({
        userId: user.id,
        action: 'auth.login_failed',
        details: { email, ip_address: ipAddress, reason: 'Invalid email or password' },
        ipAddress,
      });
      throw new UnauthorizedError('Invalid email or password');
    }

    // Clear brute force attempts on successful login
    clearAttempts(email);

    // Generate JWT with unique jti
    const jti = crypto.randomUUID();
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      site_ids: user.site_ids,
      jti,
    };

    const options: SignOptions = {
      expiresIn: env.JWT_EXPIRY as any,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, options);

    // Update last_login timestamp
    await db('users')
      .where({ id: user.id })
      .update({ last_login: db.fn.now() });

    createAuditLog({
      userId: user.id,
      action: 'auth.login',
      details: { email, ip_address: ipAddress },
      ipAddress,
    });

    sendSuccess(res, {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      must_change_password: !!user.must_change_password,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/refresh
 * Refresh JWT token with rotation (invalidates old jti).
 */
router.post('/refresh', authUser, async (req, res, next) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    // Invalidate the old token's jti if it has one
    const oldJti = (req.user as Record<string, unknown>).jti;
    if (typeof oldJti === 'string') {
      // Calculate token expiry from JWT payload
      const exp = (req.user as Record<string, unknown>).exp;
      const expiresAt = typeof exp === 'number' ? new Date(exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);
      await revokeToken(oldJti, expiresAt);
    }

    // Generate new JWT with fresh jti
    const newJti = crypto.randomUUID();
    const payload = {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      site_ids: req.user.site_ids,
      jti: newJti,
    };

    const options: SignOptions = {
      expiresIn: env.JWT_EXPIRY as any,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, options);

    sendSuccess(res, { token });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Get current user info from JWT payload.
 */
router.get('/me', authUser, async (req, res, next) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    sendSuccess(res, req.user);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/change-password
 * Change password. Required when must_change_password is true.
 */
router.post('/change-password', authUser, validateBody(changePasswordSchema), async (req, res, next) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const { current_password, new_password } = req.body;
    const db = getDb();

    // Get current user with password hash
    const user = await db('users').where({ id: req.user.id }).first();
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    // Verify current password
    const isValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash new password and update
    const newHash = await bcrypt.hash(new_password, 12);
    await db('users')
      .where({ id: req.user.id })
      .update({
        password_hash: newHash,
        must_change_password: false,
        token_valid_after: db.fn.now(),
      });

    // Generate new token
    const jti = crypto.randomUUID();
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      site_ids: user.site_ids,
      jti,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRY as any });

    createAuditLog({
      userId: user.id,
      action: 'auth.password_changed',
      details: { forced: !!user.must_change_password },
      ipAddress: getClientIp(req),
    });

    sendSuccess(res, {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
