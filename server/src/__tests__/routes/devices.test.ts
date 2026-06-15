import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/testApp.js';
import { getDb } from '../../lib/db.js';
import { createMockKnex } from '../helpers/mockDb.js';
import { sendCommandToAgent } from '../../services/agentWs.js';
import {
  generateTestToken,
  SUPER_ADMIN,
  SITE_ADMIN,
  OPERATOR,
  TEST_SITE_ID,
  TEST_DEVICE_ID,
} from '../helpers/auth.js';

const MOCK_DEVICE = {
  id: TEST_DEVICE_ID,
  mac_address: 'AA:BB:CC:DD:EE:FF',
  site_id: TEST_SITE_ID,
  type: 'windows_pc',
  hostname: 'display-01',
  display_name: 'Lobby Screen',
  status: 'online',
  config: {},
  api_key: 'test-api-key-123',
  agent_connected: false,
  agent_version: null,
  last_health: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('Routes: /api/devices', () => {
  let app: ReturnType<typeof getTestApp>;
  let mockKnex: ReturnType<typeof createMockKnex>;
  let superToken: string;
  let siteAdminToken: string;
  let operatorToken: string;

  beforeEach(() => {
    mockKnex = createMockKnex();
    vi.mocked(getDb).mockReturnValue(mockKnex as any);
    app = getTestApp();
    superToken = generateTestToken(SUPER_ADMIN);
    siteAdminToken = generateTestToken(SITE_ADMIN);
    operatorToken = generateTestToken(OPERATOR);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // GET /api/devices
  // ---------------------------------------------------------------------------
  describe('GET /api/devices', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get(`/api/devices?site_id=${TEST_SITE_ID}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 without site_id query', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);

      const res = await request(app)
        .get('/api/devices')
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with devices list for authorized user', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', [MOCK_DEVICE]);

      const res = await request(app)
        .get(`/api/devices?site_id=${TEST_SITE_ID}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns 403 for user without site access', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const otherSiteId = '00000000-0000-0000-0000-000000000099';

      const res = await request(app)
        .get(`/api/devices?site_id=${otherSiteId}`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/devices
  // ---------------------------------------------------------------------------
  describe('POST /api/devices', () => {
    const validBody = {
      mac_address: 'AA:BB:CC:DD:EE:FF',
      site_id: TEST_SITE_ID,
      type: 'windows_pc',
      hostname: 'display-01',
      display_name: 'Lobby Screen',
    };

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/devices')
        .send(validBody);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 for operator role', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);

      const res = await request(app)
        .post('/api/devices')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send(validBody);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for invalid MAC address', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);

      const res = await request(app)
        .post('/api/devices')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ ...validBody, mac_address: 'not-a-mac' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 201 on successful device creation', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', [MOCK_DEVICE]);

      const res = await request(app)
        .post('/api/devices')
        .set('Authorization', `Bearer ${superToken}`)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/devices/:id
  // ---------------------------------------------------------------------------
  describe('GET /api/devices/:id', () => {
    it('returns 404 for non-existent device', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', []);

      const res = await request(app)
        .get(`/api/devices/${TEST_DEVICE_ID}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with device details', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', [MOCK_DEVICE]);

      const res = await request(app)
        .get(`/api/devices/${TEST_DEVICE_ID}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBe(TEST_DEVICE_ID);
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /api/devices/:id
  // ---------------------------------------------------------------------------
  describe('PUT /api/devices/:id', () => {
    it('returns 404 for non-existent device', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', []);

      const res = await request(app)
        .put(`/api/devices/${TEST_DEVICE_ID}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ display_name: 'Updated Name' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with updated device', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const updatedDevice = { ...MOCK_DEVICE, display_name: 'Updated Name' };
      mockKnex._setTableData('devices', [updatedDevice]);

      const res = await request(app)
        .put(`/api/devices/${TEST_DEVICE_ID}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ display_name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('pushes cache refresh after a screenMap update', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', [{
        ...MOCK_DEVICE,
        app_id: 'app-1',
        config: {},
      }]);
      mockKnex._setTableData('apps', [{
        id: 'app-1',
        config: {
          screens: [{ screenIndex: 0 }, { screenIndex: 1 }, { screenIndex: 2 }],
        },
      }]);

      const res = await request(app)
        .put(`/api/devices/${TEST_DEVICE_ID}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({
          config: {
            screenMap: [
              { hardwareId: '\\\\.\\DISPLAY1', url: '/display/lobby' },
              { hardwareId: '\\\\.\\DISPLAY2', url: '/display/lobby' },
              { hardwareId: '\\\\.\\DISPLAY3', url: '/display/lobby' },
            ],
          },
        });

      expect(res.status).toBe(200);
      expect(vi.mocked(sendCommandToAgent)).toHaveBeenCalledWith(
        TEST_DEVICE_ID,
        expect.objectContaining({
          type: 'agent:cache-refresh',
          payload: { reason: 'device-screenmap-updated' },
        })
      );
    });

    it('pushes cache clear when an app is unassigned from a device', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', [{
        ...MOCK_DEVICE,
        app_id: 'app-1',
      }]);

      const res = await request(app)
        .put(`/api/devices/${TEST_DEVICE_ID}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ app_id: null });

      expect(res.status).toBe(200);
      expect(vi.mocked(sendCommandToAgent)).toHaveBeenCalledWith(
        TEST_DEVICE_ID,
        expect.objectContaining({
          type: 'agent:cache-refresh',
          payload: { reason: 'device-app-unassigned' },
        })
      );
    });
  });

  describe('GET /api/devices/:id/config', () => {
    it('includes assigned app revision metadata for device clients', async () => {
      mockKnex._setTableData('devices', [{
        ...MOCK_DEVICE,
        id: TEST_DEVICE_ID,
        config: {
          apiKey: 'device-api-key',
          screenMap: [
            { hardwareId: '\\\\.\\DISPLAY1', url: '/display/lobby' },
            { hardwareId: '\\\\.\\DISPLAY2', url: '/display/lobby' },
            { hardwareId: '\\\\.\\DISPLAY3', url: '/display/lobby' },
          ],
        },
        linked_app_id: 'app-1',
        app_template_type: 'custom06-reception-program',
        app_config: {
          screens: [{ screenIndex: 0 }, { screenIndex: 1 }, { screenIndex: 2 }],
        },
        app_updated_at_token: '2026-04-27T10:00:00.123456Z',
        device_updated_at_token: '2026-04-27T10:00:00.654321Z',
        app_updated_at: '2026-04-27T10:00:00.000Z',
        updated_at: '2026-04-27T10:00:00.000Z',
      }]);

      const res = await request(app)
        .get(`/api/devices/${TEST_DEVICE_ID}/config`)
        .set('Authorization', 'Bearer device-api-key');

      expect(res.status).toBe(200);
      expect(res.body.data.assignedApp.revision).toBe('app-1:2026-04-27T10:00:00.123456Z');
      expect(res.body.data.assignedApp.updatedAt).toBe('2026-04-27T10:00:00.000Z');
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/devices/:id
  // ---------------------------------------------------------------------------
  describe('DELETE /api/devices/:id', () => {
    it('returns 403 for non-super_admin', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);

      const res = await request(app)
        .delete(`/api/devices/${TEST_DEVICE_ID}`)
        .set('Authorization', `Bearer ${siteAdminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 for non-existent device', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', []);

      const res = await request(app)
        .delete(`/api/devices/${TEST_DEVICE_ID}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 on successful delete', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', [MOCK_DEVICE]);

      const res = await request(app)
        .delete(`/api/devices/${TEST_DEVICE_ID}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/devices/:id/power
  // ---------------------------------------------------------------------------
  describe('POST /api/devices/:id/power', () => {
    it('returns 404 for non-existent device', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('devices', []);

      const res = await request(app)
        .post(`/api/devices/${TEST_DEVICE_ID}/power`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ action: 'power_off' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 for power_off (default WebSocket path)', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const wsDevice = {
        ...MOCK_DEVICE,
        type: 'windows_pc',
        agent_connected: false,
      };
      mockKnex._setTableData('devices', [wsDevice]);

      const res = await request(app)
        .post(`/api/devices/${TEST_DEVICE_ID}/power`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ action: 'power_off' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 200 for wake (WOL) with mac_address', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const wolDevice = {
        ...MOCK_DEVICE,
        mac_address: 'AA:BB:CC:DD:EE:FF',
        type: 'windows_pc',
        agent_connected: false,
      };
      mockKnex._setTableData('devices', [wolDevice]);

      const res = await request(app)
        .post(`/api/devices/${TEST_DEVICE_ID}/power`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ action: 'wake' });

      // WOL uses dgram UDP — may succeed or fail depending on env,
      // but should not be a 404 or 500
      expect(res.status).not.toBe(404);
      expect(res.status).not.toBe(500);
    });
  });
});
