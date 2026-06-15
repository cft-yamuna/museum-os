/// <reference path="../types/express.d.ts" />
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../lib/db.js';
import { NotFoundError, ForbiddenError } from '../lib/errors.js';
import { sendSuccess, sendCreated } from '../lib/response.js';
import { validateBody } from '../middleware/validate.js';
import { authUser, requireRole } from '../middleware/auth.js';

const router = Router();

// --- Schemas ---
const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1),
  role: z.enum(['super_admin', 'site_admin', 'content_manager', 'operator']),
  site_ids: z.array(z.string().uuid()).optional(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  name: z.string().min(1).optional(),
  role: z.enum(['super_admin', 'site_admin', 'content_manager', 'operator']).optional(),
  site_ids: z.array(z.string().uuid()).optional(),
  is_active: z.boolean().optional(),
}).partial();

// --- Helper function to exclude password_hash ---
function sanitizeUser(user: any) {
  const { password_hash, ...sanitized } = user;
  return sanitized;
}

// --- Routes ---

/**
 * GET /api/users
 * List all users (super_admin only).
 */
router.get('/', authUser, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const db = getDb();
    const users = await db('users')
      .select('id', 'email', 'name', 'role', 'site_ids', 'is_active', 'created_at', 'last_login')
      .orderBy('created_at', 'desc');

    sendSuccess(res, users);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/users
 * Create a new user (super_admin only).
 */
router.post('/', authUser, requireRole(['super_admin']), validateBody(createUserSchema), async (req, res, next) => {
  try {
    const { email, password, name, role, site_ids } = req.body;
    const db = getDb();

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // Insert user
    const [user] = await db('users')
      .insert({
        email,
        password_hash,
        name,
        role,
        site_ids: site_ids || null,
        is_active: true,
      })
      .returning('*');

    sendCreated(res, sanitizeUser(user));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/users/:id
 * Get a single user (super_admin only).
 */
router.get('/:id', authUser, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const user = await db('users')
      .select('id', 'email', 'name', 'role', 'site_ids', 'is_active', 'created_at', 'updated_at', 'last_login')
      .where({ id })
      .first();

    if (!user) {
      throw new NotFoundError('User', id);
    }

    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/users/:id
 * Update a user.
 * Super_admin can update any user.
 * Users can update their own name/password.
 */
router.put('/:id', authUser, validateBody(updateUserSchema), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    // Check if user exists
    const existingUser = await db('users').where({ id }).first();
    if (!existingUser) {
      throw new NotFoundError('User', id);
    }

    // Permission check
    const isSuperAdmin = req.user?.role === 'super_admin';
    const isOwnProfile = req.user?.id === id;

    if (!isSuperAdmin && !isOwnProfile) {
      throw new ForbiddenError('Cannot update other users');
    }

    // Build update object
    const updates: Record<string, any> = {};

    // Users can update own name and password
    if (req.body.name !== undefined) {
      updates.name = req.body.name;
    }

    if (req.body.password !== undefined) {
      updates.password_hash = await bcrypt.hash(req.body.password, 12);
      // Invalidate all existing tokens by setting token_valid_after
      updates.token_valid_after = db.fn.now();
    }

    // Only super_admin can update role, site_ids, email, is_active
    if (isSuperAdmin) {
      if (req.body.email !== undefined) {
        updates.email = req.body.email;
      }
      if (req.body.role !== undefined) {
        updates.role = req.body.role;
      }
      if (req.body.site_ids !== undefined) {
        updates.site_ids = req.body.site_ids;
      }
      if (req.body.is_active !== undefined) {
        updates.is_active = req.body.is_active;
      }
    }

    updates.updated_at = db.fn.now();

    // Update user
    const [updatedUser] = await db('users')
      .where({ id })
      .update(updates)
      .returning('*');

    sendSuccess(res, sanitizeUser(updatedUser));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/users/:id
 * Soft delete a user (set is_active=false).
 * Super_admin only.
 */
router.delete('/:id', authUser, requireRole(['super_admin']), async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const db = getDb();

    const existingUser = await db('users').where({ id }).first();
    if (!existingUser) {
      throw new NotFoundError('User', id);
    }

    // Soft delete
    await db('users')
      .where({ id })
      .update({
        is_active: false,
        updated_at: db.fn.now(),
      });

    sendSuccess(res, { message: 'User deactivated successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
