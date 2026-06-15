import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/testApp.js';
import { getDb } from '../../lib/db.js';
import { createMockKnex } from '../helpers/mockDb.js';
import { sendCommandToAgent } from '../../services/agentWs.js';
import {
  generateTestToken,
  SUPER_ADMIN,
  TEST_DEVICE_ID,
  TEST_SITE_ID,
} from '../helpers/auth.js';

const TEST_APP_ID = 'a0000000-0000-0000-0000-000000000001';

describe('Routes: /api/apps', () => {
  let app: ReturnType<typeof getTestApp>;
  let mockKnex: ReturnType<typeof createMockKnex>;
  let superToken: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKnex = createMockKnex();
    vi.mocked(getDb).mockReturnValue(mockKnex as any);
    app = getTestApp();
    superToken = generateTestToken(SUPER_ADMIN);
  });

  it('accepts the canonical Museum OS timeline template type when creating apps', async () => {
    mockKnex._setTableData('users', [{ ...SUPER_ADMIN, token_valid_after: null }]);
    mockKnex._setTableData('apps', [{
      id: TEST_APP_ID,
      site_id: TEST_SITE_ID,
      name: 'Museum OS Timeline',
      template_type: 'custom01-hilight-timeline',
      config: {},
      created_by: SUPER_ADMIN.id,
    }]);

    const res = await request(app)
      .post('/api/apps')
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        site_id: TEST_SITE_ID,
        name: 'Museum OS Timeline',
        template_type: 'custom01-hilight-timeline',
        config: { inactivityTimeoutSec: 15 },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.template_type).toBe('custom01-hilight-timeline');
  });

  it('pushes agent cache refresh immediately after app config save', async () => {
    mockKnex._setTableData('users', [{ ...SUPER_ADMIN, token_valid_after: null }]);
    mockKnex._setTableData('apps', [{
      id: TEST_APP_ID,
      site_id: TEST_SITE_ID,
      name: '3-Screen Program',
      template_type: 'custom06-reception-program',
      config: {},
      updated_at: '2026-04-27T10:00:00.000Z',
    }]);
    mockKnex._setTableData('devices', [{
      id: TEST_DEVICE_ID,
      app_id: TEST_APP_ID,
      config: {},
    }]);

    const res = await request(app)
      .put(`/api/apps/${TEST_APP_ID}`)
      .set('Authorization', `Bearer ${superToken}`)
      .send({
        config: {
          screens: [
            { screenIndex: 0, screenLabel: 'Left' },
            { screenIndex: 1, screenLabel: 'Center' },
            { screenIndex: 2, screenLabel: 'Right' },
          ],
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.cache_refresh_device_ids).toEqual([TEST_DEVICE_ID]);
    expect(typeof res.body.data.cache_refresh_request_id).toBe('string');
    expect(vi.mocked(sendCommandToAgent)).toHaveBeenCalledWith(
      TEST_DEVICE_ID,
      expect.objectContaining({
        type: 'agent:cache-refresh',
        payload: {
          appId: TEST_APP_ID,
          reason: 'app-save',
          requestId: res.body.data.cache_refresh_request_id,
        },
      })
    );
  });

  it('clears assigned device cache when an app is trashed', async () => {
    mockKnex._setTableData('users', [{ ...SUPER_ADMIN, token_valid_after: null }]);
    mockKnex._setTableData('apps', [{
      id: TEST_APP_ID,
      site_id: TEST_SITE_ID,
      name: '3-Screen Program',
      template_type: 'custom06-reception-program',
      config: {},
      is_active: true,
      deleted_at: null,
    }]);
    mockKnex._setTableData('devices', [{
      id: TEST_DEVICE_ID,
      app_id: TEST_APP_ID,
      config: {},
    }]);

    const res = await request(app)
      .delete(`/api/apps/${TEST_APP_ID}`)
      .set('Authorization', `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(vi.mocked(sendCommandToAgent)).toHaveBeenCalledWith(
      TEST_DEVICE_ID,
      expect.objectContaining({
        type: 'agent:cache-refresh',
        payload: { reason: 'app-trashed' },
      })
    );
  });
});
