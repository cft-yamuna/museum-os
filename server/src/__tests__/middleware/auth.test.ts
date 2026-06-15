import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/testApp.js';
import { getDb } from '../../lib/db.js';
import { createMockKnex } from '../helpers/mockDb.js';
import {
  generateTestToken,
  generateExpiredToken,
  SUPER_ADMIN,
  SITE_ADMIN,
  OPERATOR,
  TEST_SITE_ID,
} from '../helpers/auth.js';
import { isTokenRevoked } from '../../services/tokenRevocation.js';

describe('Auth Middleware', () => {
  let app: ReturnType<typeof getTestApp>;
  let mockKnex: ReturnType<typeof createMockKnex>;

  beforeEach(() => {
    mockKnex = createMockKnex();
    vi.mocked(getDb).mockReturnValue(mockKnex as any);
    app = getTestApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── authUser ───────────────────────────────────────────────

  describe('authUser', () => {
    // Uses GET /api/health/detailed which requires authUser + requireRole(['super_admin'])

    it('returns 401 when no Authorization header', async () => {
      const res = await request(app).get('/api/health/detailed');
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid format (not "Bearer xxx")', async () => {
      const res = await request(app)
        .get('/api/health/detailed')
        .set('Authorization', 'Basic abc123');
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid JWT token', async () => {
      const res = await request(app)
        .get('/api/health/detailed')
        .set('Authorization', 'Bearer invalid.jwt.token');
      expect(res.status).toBe(401);
    });

    it('returns 401 with expired JWT token', async () => {
      const token = generateExpiredToken(SUPER_ADMIN);
      const res = await request(app)
        .get('/api/health/detailed')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it('returns 401 when JTI has been revoked', async () => {
      const token = generateTestToken(SUPER_ADMIN);
      vi.mocked(isTokenRevoked).mockResolvedValueOnce(true);

      mockKnex._setTableData('users', [{ token_valid_after: null }]);

      const res = await request(app)
        .get('/api/health/detailed')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it('returns 401 when token was issued before token_valid_after', async () => {
      const token = generateTestToken(SUPER_ADMIN);
      const futureDate = new Date(Date.now() + 60_000).toISOString();

      mockKnex._setTableData('users', [{ token_valid_after: futureDate }]);

      const res = await request(app)
        .get('/api/health/detailed')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it('succeeds with valid JWT (200 response)', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);

      const token = generateTestToken(SUPER_ADMIN);
      const res = await request(app)
        .get('/api/health/detailed')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  // ─── authDevice ─────────────────────────────────────────────

  describe('authDevice', () => {
    const deviceId = 'c0000000-0000-0000-0000-000000000001';

    it('returns 401 when no Authorization header', async () => {
      const res = await request(app)
        .post(`/api/devices/${deviceId}/heartbeat`)
        .send({});
      expect(res.status).toBe(401);
    });

    it('returns 401 when API key not found in DB', async () => {
      // devices query returns undefined (no match)
      mockKnex._setTableData('devices', []);

      const res = await request(app)
        .post(`/api/devices/${deviceId}/heartbeat`)
        .set('Authorization', 'Bearer nonexistent-api-key')
        .send({});
      expect(res.status).toBe(401);
    });

    it('succeeds when API key matches device in DB', async () => {
      const apiKey = 'valid-device-api-key';
      mockKnex._setTableData('devices', [{
        id: deviceId,
        site_id: TEST_SITE_ID,
        type: 'samsung_display',
        config: { apiKey },
      }]);

      const res = await request(app)
        .post(`/api/devices/${deviceId}/heartbeat`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          status: 'idle',
          uptime: 3600,
          timestamp: Date.now(),
        });
      // Should pass auth (200 or body validation pass)
      expect(res.status).toBe(200);
    });
  });

  // ─── authUserOrDevice ───────────────────────────────────────

  describe('authUserOrDevice', () => {
    const playlistId = 'e0000000-0000-0000-0000-000000000001';

    it('returns 401 with no auth header', async () => {
      const res = await request(app).get(`/api/playlists/${playlistId}`);
      expect(res.status).toBe(401);
    });

    it('succeeds with valid JWT', async () => {
      // Mock users for token_valid_after check
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      // Mock playlists for route handler
      mockKnex._setTableData('playlists', [{
        id: playlistId,
        name: 'Test Playlist',
        site_id: TEST_SITE_ID,
      }]);

      const token = generateTestToken(SUPER_ADMIN);
      const res = await request(app)
        .get(`/api/playlists/${playlistId}`)
        .set('Authorization', `Bearer ${token}`);
      // Should not be 401 (may be 200 or other depending on mock data)
      expect(res.status).not.toBe(401);
    });

    it('succeeds with device API key when JWT fails', async () => {
      const apiKey = 'device-api-key-for-playlists';
      mockKnex._setTableData('devices', [{
        id: 'c0000000-0000-0000-0000-000000000002',
        site_id: TEST_SITE_ID,
        type: 'samsung_display',
        config: { apiKey },
      }]);
      mockKnex._setTableData('playlists', [{
        id: playlistId,
        name: 'Test Playlist',
        site_id: TEST_SITE_ID,
      }]);

      const res = await request(app)
        .get(`/api/playlists/${playlistId}`)
        .set('Authorization', `Bearer ${apiKey}`);
      expect(res.status).not.toBe(401);
    });
  });

  // ─── requireRole ────────────────────────────────────────────

  describe('requireRole', () => {
    it('returns 403 when user role not in allowed roles', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);

      // POST /api/users requires super_admin; OPERATOR should be rejected
      const token = generateTestToken(OPERATOR);
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'test@test.com',
          password: 'password123',
          name: 'Test User',
          role: 'operator',
        });
      expect(res.status).toBe(403);
    });

    it('passes when user role is in allowed roles', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);

      const token = generateTestToken(SUPER_ADMIN);
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: 'newuser@test.com',
          password: 'Password123!',
          name: 'New User',
          role: 'operator',
        });
      // Should not be 403 (may be 201 or mock-related error, but not auth error)
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });
  });

  // ─── requireSiteAccess ──────────────────────────────────────

  describe('requireSiteAccess', () => {
    it('always passes for super_admin', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('sites', [{
        id: TEST_SITE_ID,
        name: 'Test Site',
        code: 'TEST',
        is_active: true,
      }]);

      const token = generateTestToken(SUPER_ADMIN);
      const res = await request(app)
        .get(`/api/sites/${TEST_SITE_ID}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).not.toBe(403);
    });

    it('returns 403 when site_id not in user site_ids', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const otherSite = 'f0000000-0000-0000-0000-ffffffffffff';
      mockKnex._setTableData('sites', [{
        id: otherSite,
        name: 'Other Site',
        code: 'OTHER',
        is_active: true,
      }]);

      // SITE_ADMIN has site_ids: [TEST_SITE_ID], accessing otherSite
      const token = generateTestToken(SITE_ADMIN);
      const res = await request(app)
        .get(`/api/sites/${otherSite}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('passes when site_id is in user site_ids', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('sites', [{
        id: TEST_SITE_ID,
        name: 'Test Site',
        code: 'TEST',
        is_active: true,
      }]);

      const token = generateTestToken(SITE_ADMIN);
      const res = await request(app)
        .get(`/api/sites/${TEST_SITE_ID}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).not.toBe(403);
    });
  });
});
