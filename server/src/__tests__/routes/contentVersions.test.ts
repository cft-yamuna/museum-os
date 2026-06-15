import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/testApp.js';
import { getDb } from '../../lib/db.js';
import { createMockKnex } from '../helpers/mockDb.js';
import { sendCommandToAgent } from '../../services/agentWs.js';
import {
  CONTENT_MANAGER,
  TEST_CONTENT_ID,
  TEST_SITE_ID,
  SUPER_ADMIN,
  generateTestToken,
} from '../helpers/auth.js';

const SPECIAL_FILENAME = 'My Clip #1 (final)+é.mov';
const ENCODED_SPECIAL_FILENAME = 'My%20Clip%20%231%20(final)%2B%C3%A9.mov';

describe('Routes: /api/content/:id/rollback', () => {
  let app: ReturnType<typeof getTestApp>;
  let mockKnex: ReturnType<typeof createMockKnex>;
  let token: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKnex = createMockKnex();
    vi.mocked(getDb).mockReturnValue(mockKnex as any);
    app = getTestApp();
    token = generateTestToken(CONTENT_MANAGER);
  });

  it('pushes agent cache refresh after a rollback', async () => {
    mockKnex._setTableData('users', [{ ...CONTENT_MANAGER, token_valid_after: null }]);
    mockKnex._setTableData('content', [{
      id: TEST_CONTENT_ID,
      site_id: TEST_SITE_ID,
      name: 'Program Video',
      type: 'video',
      current_version: 2,
    }]);
    mockKnex._setTableData('content_versions', [{
      id: 'v1',
      content_id: TEST_CONTENT_ID,
      version_number: 1,
      file_path: '/storage/test/video/content-id/v1/program.mp4',
      file_size: 1024,
      hash: 'abc123',
      metadata: null,
      created_at: '2026-04-27T09:00:00.000Z',
      created_by: CONTENT_MANAGER.id,
    }]);
    mockKnex._setTableData('playlist_items', [{ playlist_id: 'playlist-1', content_id: TEST_CONTENT_ID }]);
    mockKnex._setTableData('apps', [{
      id: 'app-1',
      site_id: TEST_SITE_ID,
      deleted_at: null,
      config: { playlistId: 'playlist-1' },
    }]);
    mockKnex._setTableData('devices', [{ id: 'device-1', app_id: 'app-1' }]);

    const res = await request(app)
      .post(`/api/content/${TEST_CONTENT_ID}/rollback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 1 });

    expect(res.status).toBe(200);
    expect(vi.mocked(sendCommandToAgent)).toHaveBeenCalledWith(
      'device-1',
      expect.objectContaining({
        type: 'agent:cache-refresh',
        payload: { reason: 'content-version-rollback' },
      })
    );
  });

  it('returns encoded URLs in version history', async () => {
    const superToken = generateTestToken(SUPER_ADMIN);
    mockKnex._setTableData('users', [{ ...SUPER_ADMIN, token_valid_after: null }]);
    mockKnex._setTableData('content', [{
      id: TEST_CONTENT_ID,
      site_id: TEST_SITE_ID,
      name: 'Program Video',
      type: 'video',
      current_version: 1,
    }]);
    mockKnex._setTableData('content_versions', [{
      id: 'v-special',
      content_id: TEST_CONTENT_ID,
      version_number: 1,
      file_path: `${TEST_SITE_ID}/video/${TEST_CONTENT_ID}/v1/${SPECIAL_FILENAME}`,
      file_size: 1024,
      hash: 'abc123',
      metadata: { originalName: SPECIAL_FILENAME, mimeType: 'video/quicktime' },
      created_at: '2026-04-27T09:00:00.000Z',
      created_by: CONTENT_MANAGER.id,
    }]);

    const res = await request(app)
      .get(`/api/content/${TEST_CONTENT_ID}/versions`)
      .set('Authorization', `Bearer ${superToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].url).toBe(
      `/storage/${TEST_SITE_ID}/video/${TEST_CONTENT_ID}/v1/${ENCODED_SPECIAL_FILENAME}`
    );
  });
});
