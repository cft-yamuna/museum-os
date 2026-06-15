import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/testApp.js';
import { getDb } from '../../lib/db.js';
import { createMockKnex } from '../helpers/mockDb.js';
import { generateTestToken, SUPER_ADMIN, TEST_SITE_ID, TEST_DEVICE_ID } from '../helpers/auth.js';

describe('agentCommands routes', () => {
  let app: ReturnType<typeof getTestApp>;
  let mockKnex: ReturnType<typeof createMockKnex>;
  let token: string;

  beforeEach(() => {
    mockKnex = createMockKnex();
    vi.mocked(getDb).mockReturnValue(mockKnex as any);
    app = getTestApp();
    token = generateTestToken(SUPER_ADMIN);
  });

  // ── POST /api/devices/:id/agent-command ──────────────────────────────

  describe('POST /api/devices/:id/agent-command', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post(`/api/devices/${TEST_DEVICE_ID}/agent-command`)
        .send({ command: 'ping' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 for non-existent device', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', []);

      const res = await request(app)
        .post(`/api/devices/${TEST_DEVICE_ID}/agent-command`)
        .set('Authorization', `Bearer ${token}`)
        .send({ command: 'ping' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when agent is not connected', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', [{
        id: TEST_DEVICE_ID,
        site_id: TEST_SITE_ID,
        agent_connected: false,
        agent_version: null,
        config: {},
      }]);

      const res = await request(app)
        .post(`/api/devices/${TEST_DEVICE_ID}/agent-command`)
        .set('Authorization', `Bearer ${token}`)
        .send({ command: 'ping' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for disallowed command', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', [{
        id: TEST_DEVICE_ID,
        site_id: TEST_SITE_ID,
        agent_connected: true,
        agent_version: '1.0.0',
        config: {},
      }]);

      const res = await request(app)
        .post(`/api/devices/${TEST_DEVICE_ID}/agent-command`)
        .set('Authorization', `Bearer ${token}`)
        .send({ command: 'rm -rf /' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with fire-and-forget command', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', [{
        id: TEST_DEVICE_ID,
        site_id: TEST_SITE_ID,
        agent_connected: true,
        agent_version: '1.0.0',
        config: {},
      }]);

      const res = await request(app)
        .post(`/api/devices/${TEST_DEVICE_ID}/agent-command`)
        .set('Authorization', `Bearer ${token}`)
        .send({ command: 'ping' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 200 with await_response result', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', [{
        id: TEST_DEVICE_ID,
        site_id: TEST_SITE_ID,
        agent_connected: true,
        agent_version: '1.0.0',
        config: {},
      }]);

      const res = await request(app)
        .post(`/api/devices/${TEST_DEVICE_ID}/agent-command`)
        .set('Authorization', `Bearer ${token}`)
        .send({ command: 'status', await_response: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // ── GET /api/devices/:id/agent ───────────────────────────────────────

  describe('GET /api/devices/:id/agent', () => {
    it('returns 404 for non-existent device', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', []);

      const res = await request(app)
        .get(`/api/devices/${TEST_DEVICE_ID}/agent`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with agent info', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', [{
        id: TEST_DEVICE_ID,
        site_id: TEST_SITE_ID,
        agent_connected: true,
        agent_version: '1.0.0',
        capabilities: ['screenshot', 'power'],
        last_health: { cpu: 12, memory: 45 },
        config: {},
      }]);

      const res = await request(app)
        .get(`/api/devices/${TEST_DEVICE_ID}/agent`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // ── GET /api/devices/:id/health ──────────────────────────────────────

  describe('GET /api/devices/:id/health', () => {
    it('returns 404 for non-existent device', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', []);

      const res = await request(app)
        .get(`/api/devices/${TEST_DEVICE_ID}/health`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with health history', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', [{
        id: TEST_DEVICE_ID,
        site_id: TEST_SITE_ID,
        agent_connected: true,
        agent_version: '1.0.0',
        config: {},
      }]);
      mockKnex._setTableData('device_health', [
        { id: 'h-1', device_id: TEST_DEVICE_ID, cpu: 10, memory: 40, disk: 55, created_at: new Date().toISOString() },
        { id: 'h-2', device_id: TEST_DEVICE_ID, cpu: 15, memory: 42, disk: 56, created_at: new Date().toISOString() },
      ]);

      const res = await request(app)
        .get(`/api/devices/${TEST_DEVICE_ID}/health`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });
});
