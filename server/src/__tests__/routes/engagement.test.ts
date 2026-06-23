import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/testApp.js';
import { getDb } from '../../lib/db.js';
import { createMockKnex } from '../helpers/mockDb.js';
import { generateTestToken, SUPER_ADMIN, OPERATOR, TEST_SITE_ID } from '../helpers/auth.js';

/**
 * These tests cover the security + validation surface of the engagement API
 * (auth, role gate, query validation) — all of which short-circuit before the
 * SQL aggregation runs. The aggregation itself (sessionization, rollup) relies
 * on real Postgres window functions and is verified manually / in integration
 * against a live DB, not through the mocked query builder.
 */
describe('Routes: /api/engagement', () => {
  let app: ReturnType<typeof getTestApp>;
  let mockKnex: ReturnType<typeof createMockKnex>;
  let superToken: string;

  beforeEach(() => {
    mockKnex = createMockKnex();
    vi.mocked(getDb).mockReturnValue(mockKnex as any);
    app = getTestApp();
    superToken = generateTestToken(SUPER_ADMIN);
  });

  describe('GET /api/engagement/summary', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get(`/api/engagement/summary?site_id=${TEST_SITE_ID}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 for operator (business-data role gate)', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const token = generateTestToken(OPERATOR);

      const res = await request(app)
        .get(`/api/engagement/summary?site_id=${TEST_SITE_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when site_id is missing', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);

      const res = await request(app)
        .get('/api/engagement/summary')
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for out-of-range hours', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);

      const res = await request(app)
        .get(`/api/engagement/summary?site_id=${TEST_SITE_ID}&hours=0`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('other engagement endpoints', () => {
    it('dwell-by-exhibit returns 401 without auth', async () => {
      const res = await request(app).get(`/api/engagement/dwell-by-exhibit?site_id=${TEST_SITE_ID}`);
      expect(res.status).toBe(401);
    });

    it('heatmap returns 400 for invalid site_id', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const res = await request(app)
        .get('/api/engagement/heatmap?site_id=not-a-uuid')
        .set('Authorization', `Bearer ${superToken}`);
      expect(res.status).toBe(400);
    });

    it('export.csv returns 403 for operator', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const token = generateTestToken(OPERATOR);
      const res = await request(app)
        .get(`/api/engagement/export.csv?site_id=${TEST_SITE_ID}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });
});
