import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/testApp.js';
import { getDb } from '../../lib/db.js';
import { createMockKnex } from '../helpers/mockDb.js';
import { generateTestToken, SUPER_ADMIN, TEST_SITE_ID, TEST_DEVICE_ID } from '../helpers/auth.js';

const deviceId = 'c0000000-0000-0000-0000-000000000001';
const otherDeviceId = 'c0000000-0000-0000-0000-000000000099';
const apiKey = 'test-api-key-for-heartbeat';

describe('heartbeat routes', () => {
  let app: ReturnType<typeof getTestApp>;
  let mockKnex: ReturnType<typeof createMockKnex>;

  beforeEach(() => {
    mockKnex = createMockKnex();
    vi.mocked(getDb).mockReturnValue(mockKnex as any);
    app = getTestApp();
  });

  // ── POST /api/devices/:id/heartbeat ──────────────────────────────────

  describe('POST /api/devices/:id/heartbeat', () => {
    const validBody = {
      status: 'idle',
      uptime: 12345,
      timestamp: Date.now(),
    };

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post(`/api/devices/${deviceId}/heartbeat`)
        .send(validBody);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 when device ID does not match authenticated device', async () => {
      mockKnex._setTableData('devices', [{
        id: deviceId,
        site_id: TEST_SITE_ID,
        type: 'samsung_display',
        config: { apiKey },
      }]);

      const res = await request(app)
        .post(`/api/devices/${otherDeviceId}/heartbeat`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send(validBody);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for invalid heartbeat body (missing status)', async () => {
      mockKnex._setTableData('devices', [{
        id: deviceId,
        site_id: TEST_SITE_ID,
        type: 'samsung_display',
        config: { apiKey },
      }]);

      const res = await request(app)
        .post(`/api/devices/${deviceId}/heartbeat`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send({ uptime: 100, timestamp: Date.now() });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 for valid heartbeat', async () => {
      mockKnex._setTableData('devices', [{
        id: deviceId,
        site_id: TEST_SITE_ID,
        type: 'samsung_display',
        config: { apiKey },
      }]);

      const res = await request(app)
        .post(`/api/devices/${deviceId}/heartbeat`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── GET /api/devices/:id/logs ────────────────────────────────────────

  describe('GET /api/devices/:id/logs', () => {
    const token = generateTestToken(SUPER_ADMIN);

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .get(`/api/devices/${TEST_DEVICE_ID}/logs`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 for non-existent device', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', []);

      const res = await request(app)
        .get(`/api/devices/${TEST_DEVICE_ID}/logs`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with paginated logs', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', [{
        id: TEST_DEVICE_ID,
        site_id: TEST_SITE_ID,
        type: 'samsung_display',
        config: {},
      }]);
      mockKnex._setTableData('device_logs', [
        { id: 'log-1', device_id: TEST_DEVICE_ID, level: 'info', message: 'Boot complete', created_at: new Date().toISOString() },
        { id: 'log-2', device_id: TEST_DEVICE_ID, level: 'warn', message: 'High temp', created_at: new Date().toISOString() },
      ]);

      const res = await request(app)
        .get(`/api/devices/${TEST_DEVICE_ID}/logs?page=1&limit=10`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // ── POST /api/devices/:id/logs ───────────────────────────────────────

  describe('POST /api/devices/:id/logs', () => {
    const validEntries = {
      entries: [
        { level: 'info', message: 'App started', timestamp: Date.now() },
        { level: 'error', message: 'Network timeout', timestamp: Date.now() },
      ],
    };

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post(`/api/devices/${deviceId}/logs`)
        .send(validEntries);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 when device ID does not match', async () => {
      mockKnex._setTableData('devices', [{
        id: deviceId,
        site_id: TEST_SITE_ID,
        type: 'samsung_display',
        config: { apiKey },
      }]);

      const res = await request(app)
        .post(`/api/devices/${otherDeviceId}/logs`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send(validEntries);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 for valid log entries', async () => {
      mockKnex._setTableData('devices', [{
        id: deviceId,
        site_id: TEST_SITE_ID,
        type: 'samsung_display',
        config: { apiKey },
      }]);

      const res = await request(app)
        .post(`/api/devices/${deviceId}/logs`)
        .set('Authorization', `Bearer ${apiKey}`)
        .send(validEntries);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
