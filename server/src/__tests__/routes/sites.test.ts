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

const TEST_SITE = {
  id: TEST_SITE_ID,
  name: 'Museum OS',
  code: 'hilight-museum',
  address: '123 Museum Road',
  timezone: 'Asia/Kolkata',
  config: {},
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('Routes: /api/sites', () => {
  let app: ReturnType<typeof getTestApp>;
  let mockKnex: ReturnType<typeof createMockKnex>;
  let superToken: string;

  beforeEach(() => {
    mockKnex = createMockKnex();
    vi.mocked(getDb).mockReturnValue(mockKnex as any);
    app = getTestApp();
    superToken = generateTestToken(SUPER_ADMIN);
  });

  // ── GET /api/sites ──────────────────────────────────────────────────

  describe('GET /api/sites', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/sites');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with sites list for super_admin', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('sites', [TEST_SITE]);

      const res = await request(app)
        .get('/api/sites')
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns 200 for site_admin (filtered by site_ids)', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('sites', [TEST_SITE]);
      const token = generateTestToken(SITE_ADMIN);

      const res = await request(app)
        .get('/api/sites')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── POST /api/sites ─────────────────────────────────────────────────

  describe('POST /api/sites', () => {
    const validBody = {
      name: 'New Museum',
      code: 'new-museum',
      address: '456 New Road',
      timezone: 'Asia/Kolkata',
    };

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/sites')
        .send(validBody);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 for non-super_admin', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const token = generateTestToken(SITE_ADMIN);

      const res = await request(app)
        .post('/api/sites')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for missing name', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);

      const res = await request(app)
        .post('/api/sites')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ code: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 201 on successful site creation', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('sites', [TEST_SITE]);

      const res = await request(app)
        .post('/api/sites')
        .set('Authorization', `Bearer ${superToken}`)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // ── GET /api/sites/:id ──────────────────────────────────────────────

  describe('GET /api/sites/:id', () => {
    it('returns 404 for non-existent site', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('sites', []);

      const res = await request(app)
        .get(`/api/sites/${TEST_SITE_ID}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with site details for super_admin', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('sites', [TEST_SITE]);

      const res = await request(app)
        .get(`/api/sites/${TEST_SITE_ID}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('returns 403 for user without site access', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('sites', [TEST_SITE]);
      const otherOperator = {
        ...OPERATOR,
        site_ids: ['00000000-0000-0000-0000-000000000099'],
      };
      const token = generateTestToken(otherOperator);

      const res = await request(app)
        .get(`/api/sites/${TEST_SITE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // ── PUT /api/sites/:id ──────────────────────────────────────────────

  describe('PUT /api/sites/:id', () => {
    it('returns 404 for non-existent site', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('sites', []);

      const res = await request(app)
        .put(`/api/sites/${TEST_SITE_ID}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'Updated Museum' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 for operator role', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const token = generateTestToken(OPERATOR);

      const res = await request(app)
        .put(`/api/sites/${TEST_SITE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Museum' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with updated site', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('sites', [TEST_SITE]);

      const res = await request(app)
        .put(`/api/sites/${TEST_SITE_ID}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'Updated Museum OS' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // ── DELETE /api/sites/:id ───────────────────────────────────────────

  describe('DELETE /api/sites/:id', () => {
    it('returns 403 for non-super_admin', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const token = generateTestToken(SITE_ADMIN);

      const res = await request(app)
        .delete(`/api/sites/${TEST_SITE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 for non-existent site', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('sites', []);

      const res = await request(app)
        .delete(`/api/sites/${TEST_SITE_ID}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 on successful soft delete', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('sites', [TEST_SITE]);

      const res = await request(app)
        .delete(`/api/sites/${TEST_SITE_ID}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
