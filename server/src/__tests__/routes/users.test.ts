import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/testApp.js';
import { getDb } from '../../lib/db.js';
import { createMockKnex } from '../helpers/mockDb.js';
import {
  generateTestToken,
  SUPER_ADMIN,
  SITE_ADMIN,
  OPERATOR,
  TEST_SITE_ID,
} from '../helpers/auth.js';

const TEST_USER = {
  id: 'a0000000-0000-0000-0000-000000000010',
  email: 'testuser@lightman.local',
  name: 'Test User',
  role: 'operator',
  site_ids: [TEST_SITE_ID],
  is_active: true,
  password_hash: '$2b$04$fakehashfortest',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_login: null,
};

describe('Routes: /api/users', () => {
  let app: ReturnType<typeof getTestApp>;
  let mockKnex: ReturnType<typeof createMockKnex>;
  let superToken: string;

  beforeEach(() => {
    mockKnex = createMockKnex();
    vi.mocked(getDb).mockReturnValue(mockKnex as any);
    app = getTestApp();
    superToken = generateTestToken(SUPER_ADMIN);
  });

  // ── GET /api/users ──────────────────────────────────────────────────

  describe('GET /api/users', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/users');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 for non-super_admin', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const token = generateTestToken(OPERATOR);

      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with users list for super_admin', async () => {
      mockKnex._setTableData('users', [TEST_USER]);

      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ── POST /api/users ─────────────────────────────────────────────────

  describe('POST /api/users', () => {
    const validBody = {
      email: 'newuser@lightman.local',
      password: 'securepass123',
      name: 'New User',
      role: 'operator',
      site_ids: [TEST_SITE_ID],
    };

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/users')
        .send(validBody);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 for non-super_admin', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const token = generateTestToken(SITE_ADMIN);

      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for invalid email', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);

      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ ...validBody, email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for short password', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);

      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ ...validBody, password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 201 on successful user creation', async () => {
      mockKnex._setTableData('users', [TEST_USER]);

      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${superToken}`)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      // Should not contain password_hash
      expect(res.body.data.password_hash).toBeUndefined();
    });
  });

  // ── GET /api/users/:id ──────────────────────────────────────────────

  describe('GET /api/users/:id', () => {
    it('returns 404 for non-existent user', async () => {
      mockKnex._setTableData('users', []);

      const res = await request(app)
        .get(`/api/users/${TEST_USER.id}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with user details', async () => {
      mockKnex._setTableData('users', [TEST_USER]);

      const res = await request(app)
        .get(`/api/users/${TEST_USER.id}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // ── PUT /api/users/:id ──────────────────────────────────────────────

  describe('PUT /api/users/:id', () => {
    it('returns 404 for non-existent user', async () => {
      mockKnex._setTableData('users', []);

      const res = await request(app)
        .put(`/api/users/${TEST_USER.id}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 for non-admin updating another user', async () => {
      mockKnex._setTableData('users', [TEST_USER]);
      const token = generateTestToken(OPERATOR);

      const res = await request(app)
        .put(`/api/users/${TEST_USER.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 for super_admin updating a user', async () => {
      mockKnex._setTableData('users', [TEST_USER]);

      const res = await request(app)
        .put(`/api/users/${TEST_USER.id}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'Updated Name', role: 'content_manager' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('allows user to update own profile', async () => {
      // OPERATOR updating themselves
      mockKnex._setTableData('users', [{ ...OPERATOR, password_hash: 'hash', token_valid_after: null }]);
      const token = generateTestToken(OPERATOR);

      const res = await request(app)
        .put(`/api/users/${OPERATOR.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'My New Name' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── DELETE /api/users/:id ───────────────────────────────────────────

  describe('DELETE /api/users/:id', () => {
    it('returns 403 for non-super_admin', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const token = generateTestToken(SITE_ADMIN);

      const res = await request(app)
        .delete(`/api/users/${TEST_USER.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 for non-existent user', async () => {
      mockKnex._setTableData('users', []);

      const res = await request(app)
        .delete(`/api/users/${TEST_USER.id}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 on successful soft delete', async () => {
      mockKnex._setTableData('users', [TEST_USER]);

      const res = await request(app)
        .delete(`/api/users/${TEST_USER.id}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
