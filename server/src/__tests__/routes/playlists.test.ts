import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/testApp.js';
import { getDb } from '../../lib/db.js';
import { createMockKnex } from '../helpers/mockDb.js';
import { sendCommandToAgent } from '../../services/agentWs.js';
import {
  generateTestToken,
  SUPER_ADMIN,
  OPERATOR,
  CONTENT_MANAGER,
  TEST_SITE_ID,
  TEST_PLAYLIST_ID,
  TEST_CONTENT_ID,
} from '../helpers/auth.js';

const TEST_PLAYLIST = {
  id: TEST_PLAYLIST_ID,
  site_id: TEST_SITE_ID,
  name: 'Lobby Loop',
  description: 'Lobby display playlist',
  loop: true,
  is_active: true,
  created_by: SUPER_ADMIN.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const TEST_CONTENT = {
  id: TEST_CONTENT_ID,
  site_id: TEST_SITE_ID,
  name: 'Test Video',
  type: 'video',
  current_version: 1,
};

const TEST_ITEM = {
  id: 'f0000000-0000-0000-0000-000000000001',
  playlist_id: TEST_PLAYLIST_ID,
  content_id: TEST_CONTENT_ID,
  position: 0,
  duration_sec: 30,
  transition: 'fade',
  config: null,
};

const SPECIAL_FILENAME = 'My Clip #1 (final)+é.mov';
const ENCODED_SPECIAL_FILENAME = 'My%20Clip%20%231%20(final)%2B%C3%A9.mov';

describe('Routes: /api/playlists', () => {
  let app: ReturnType<typeof getTestApp>;
  let mockKnex: ReturnType<typeof createMockKnex>;
  let superToken: string;

  beforeEach(() => {
    mockKnex = createMockKnex();
    vi.mocked(getDb).mockReturnValue(mockKnex as any);
    app = getTestApp();
    superToken = generateTestToken(SUPER_ADMIN);
  });

  // ── GET /api/playlists ──────────────────────────────────────────────

  describe('GET /api/playlists', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app)
        .get(`/api/playlists?site_id=${TEST_SITE_ID}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 without site_id', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);

      const res = await request(app)
        .get('/api/playlists')
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with playlists list', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('playlists', [TEST_PLAYLIST]);

      const res = await request(app)
        .get(`/api/playlists?site_id=${TEST_SITE_ID}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ── POST /api/playlists ─────────────────────────────────────────────

  describe('POST /api/playlists', () => {
    const validBody = {
      site_id: TEST_SITE_ID,
      name: 'New Playlist',
      description: 'A new playlist',
      loop: true,
    };

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/playlists')
        .send(validBody);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 for operator role', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const token = generateTestToken(OPERATOR);

      const res = await request(app)
        .post('/api/playlists')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 201 on successful playlist creation', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('playlists', [TEST_PLAYLIST]);

      const res = await request(app)
        .post('/api/playlists')
        .set('Authorization', `Bearer ${superToken}`)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // ── GET /api/playlists/:id ──────────────────────────────────────────

  describe('GET /api/playlists/:id', () => {
    it('returns 404 for non-existent playlist', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('playlists', []);

      const res = await request(app)
        .get(`/api/playlists/${TEST_PLAYLIST_ID}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with playlist details and items', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('playlists', [TEST_PLAYLIST]);
      mockKnex._setTableData('playlist_items', [{
        id: TEST_ITEM.id,
        content_id: TEST_CONTENT_ID,
        content_name: 'My Clip',
        content_type: 'video',
        position: 0,
        duration_sec: 30,
        transition: 'fade',
        config: null,
        current_version: 1,
        file_path: `${TEST_SITE_ID}/video/${TEST_CONTENT_ID}/v1/${SPECIAL_FILENAME}`,
      }]);

      const res = await request(app)
        .get(`/api/playlists/${TEST_PLAYLIST_ID}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.items).toBeDefined();
      expect(res.body.data.items[0].url).toBe(
        `/storage/${TEST_SITE_ID}/video/${TEST_CONTENT_ID}/v1/${ENCODED_SPECIAL_FILENAME}`
      );
    });
  });

  // ── PUT /api/playlists/:id ──────────────────────────────────────────

  describe('PUT /api/playlists/:id', () => {
    it('returns 404 for non-existent playlist', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('playlists', []);

      const res = await request(app)
        .put(`/api/playlists/${TEST_PLAYLIST_ID}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'Updated Playlist' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with updated playlist', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('playlists', [TEST_PLAYLIST]);
      mockKnex._setTableData('apps', [{
        id: 'app-1',
        site_id: TEST_SITE_ID,
        deleted_at: null,
        config: { playlistId: TEST_PLAYLIST_ID },
      }]);
      mockKnex._setTableData('devices', [{ id: 'device-1', app_id: 'app-1' }]);

      const res = await request(app)
        .put(`/api/playlists/${TEST_PLAYLIST_ID}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'Updated Lobby Loop' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(vi.mocked(sendCommandToAgent)).toHaveBeenCalledWith(
        'device-1',
        expect.objectContaining({
          type: 'agent:cache-refresh',
          payload: { reason: 'playlist-updated' },
        })
      );
    });
  });

  // ── DELETE /api/playlists/:id ───────────────────────────────────────

  describe('DELETE /api/playlists/:id', () => {
    it('returns 403 for operator/content_manager', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      const token = generateTestToken(CONTENT_MANAGER);

      const res = await request(app)
        .delete(`/api/playlists/${TEST_PLAYLIST_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 404 for non-existent playlist', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('playlists', []);

      const res = await request(app)
        .delete(`/api/playlists/${TEST_PLAYLIST_ID}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 on successful soft delete', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('playlists', [TEST_PLAYLIST]);

      const res = await request(app)
        .delete(`/api/playlists/${TEST_PLAYLIST_ID}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── POST /api/playlists/:id/items ───────────────────────────────────

  describe('POST /api/playlists/:id/items', () => {
    const validBody = {
      content_id: TEST_CONTENT_ID,
      duration_sec: 30,
      transition: 'fade',
    };

    it('returns 404 for non-existent playlist', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('playlists', []);

      const res = await request(app)
        .post(`/api/playlists/${TEST_PLAYLIST_ID}/items`)
        .set('Authorization', `Bearer ${superToken}`)
        .send(validBody);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 201 when adding an item', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('playlists', [TEST_PLAYLIST]);
      mockKnex._setTableData('content', [TEST_CONTENT]);
      mockKnex._setTableData('playlist_items', [TEST_ITEM]);
      mockKnex._setTableData('content_versions', [{
        content_id: TEST_CONTENT_ID,
        version_number: 1,
        file_path: '/storage/test/video/test-id/v1/test.mp4',
      }]);

      const res = await request(app)
        .post(`/api/playlists/${TEST_PLAYLIST_ID}/items`)
        .set('Authorization', `Bearer ${superToken}`)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  // ── DELETE /api/playlists/:id/items/:itemId ─────────────────────────

  describe('DELETE /api/playlists/:id/items/:itemId', () => {
    it('returns 404 for non-existent playlist', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('playlists', []);

      const res = await request(app)
        .delete(`/api/playlists/${TEST_PLAYLIST_ID}/items/${TEST_ITEM.id}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 when removing an item', async () => {
      mockKnex._setTableData('users', [{ token_valid_after: null }]);
      mockKnex._setTableData('playlists', [TEST_PLAYLIST]);
      mockKnex._setTableData('playlist_items', [TEST_ITEM]);

      const res = await request(app)
        .delete(`/api/playlists/${TEST_PLAYLIST_ID}/items/${TEST_ITEM.id}`)
        .set('Authorization', `Bearer ${superToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
