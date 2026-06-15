import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/testApp.js';
import { getDb } from '../../lib/db.js';
import { createMockKnex } from '../helpers/mockDb.js';
import { storeFile } from '../../services/storage.js';
import {
  generateTestToken,
  SUPER_ADMIN,
  SITE_ADMIN,
  CONTENT_MANAGER,
  OPERATOR,
  TEST_SITE_ID,
  TEST_CONTENT_ID,
} from '../helpers/auth.js';

const testContent = {
  id: TEST_CONTENT_ID,
  site_id: TEST_SITE_ID,
  name: 'Test Video',
  type: 'video',
  description: 'A test video',
  current_version: 1,
  is_active: true,
  created_by: SUPER_ADMIN.id,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  file_path: '/storage/test/video/test-id/v1/test.mp4',
  file_size: 1024,
  hash: 'abc123',
  metadata: { originalName: 'test.mp4', mimeType: 'video/mp4' },
};

const SPECIAL_FILENAME = 'My Clip #1 (final)+é.mov';
const ENCODED_SPECIAL_FILENAME = 'My%20Clip%20%231%20(final)%2B%C3%A9.mov';

describe('routes/content', () => {
  let app: ReturnType<typeof getTestApp>;
  let mockKnex: ReturnType<typeof createMockKnex>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKnex = createMockKnex();
    vi.mocked(getDb).mockReturnValue(mockKnex as any);
    app = getTestApp();
  });

  describe('GET /api/content', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/content');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 without site_id query param', async () => {
      const token = generateTestToken(SUPER_ADMIN);
      mockKnex._setTableData('users', [{ ...SUPER_ADMIN, token_valid_after: null }]);

      const res = await request(app)
        .get('/api/content')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with content list', async () => {
      const token = generateTestToken(SUPER_ADMIN);
      mockKnex._setTableData('users', [{ ...SUPER_ADMIN, token_valid_after: null }]);
      mockKnex._setTableData('content', [testContent]);

      const res = await request(app)
        .get('/api/content')
        .query({ site_id: TEST_SITE_ID })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns encoded URLs for symbol-heavy filenames', async () => {
      const token = generateTestToken(SUPER_ADMIN);
      mockKnex._setTableData('users', [{ ...SUPER_ADMIN, token_valid_after: null }]);
      mockKnex._setTableData('content', [{
        ...testContent,
        file_path: `${TEST_SITE_ID}/video/${TEST_CONTENT_ID}/v1/${SPECIAL_FILENAME}`,
        metadata: { originalName: SPECIAL_FILENAME, mimeType: 'video/quicktime' },
      }]);

      const res = await request(app)
        .get('/api/content')
        .query({ site_id: TEST_SITE_ID })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data[0].url).toBe(
        `/storage/${TEST_SITE_ID}/video/${TEST_CONTENT_ID}/v1/${ENCODED_SPECIAL_FILENAME}`
      );
    });

    it('returns 403 for user without site access', async () => {
      const otherSiteAdmin = {
        ...SITE_ADMIN,
        site_id: '00000000-0000-0000-0000-000000000099',
        site_ids: ['00000000-0000-0000-0000-000000000099'],
      };
      const token = generateTestToken(otherSiteAdmin);
      mockKnex._setTableData('users', [{ ...otherSiteAdmin, token_valid_after: null }]);

      const res = await request(app)
        .get('/api/content')
        .query({ site_id: TEST_SITE_ID })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/content', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).post('/api/content');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 403 for operator role', async () => {
      const token = generateTestToken(OPERATOR);
      mockKnex._setTableData('users', [{ ...OPERATOR, token_valid_after: null }]);

      const res = await request(app)
        .post('/api/content')
        .set('Authorization', `Bearer ${token}`)
        .field('site_id', TEST_SITE_ID)
        .field('name', 'Test Video')
        .field('description', 'A test video')
        .attach('file', Buffer.from('fake video content'), {
          filename: 'test.mp4',
          contentType: 'video/mp4',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 201 when uploading a file', async () => {
      const token = generateTestToken(CONTENT_MANAGER);
      mockKnex._setTableData('users', [{ ...CONTENT_MANAGER, token_valid_after: null }]);
      mockKnex._setTableData('content', [testContent]);
      mockKnex._setTableData('content_versions', [{
        id: 'v-1',
        content_id: TEST_CONTENT_ID,
        version_number: 1,
        file_path: '/storage/test/video/test-id/v1/test.mp4',
        file_size: 1024,
        hash: 'abc123',
        metadata: { originalName: 'test.mp4', mimeType: 'video/mp4' },
      }]);

      const res = await request(app)
        .post('/api/content')
        .set('Authorization', `Bearer ${token}`)
        .field('site_id', TEST_SITE_ID)
        .field('name', 'Test Video')
        .field('description', 'A test video')
        .attach('file', Buffer.from('fake video content'), {
          filename: 'test.mp4',
          contentType: 'video/mp4',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it('accepts MOV uploads via extension fallback and returns an encoded URL', async () => {
      const token = generateTestToken(CONTENT_MANAGER);
      vi.mocked(storeFile).mockResolvedValueOnce({
        filePath: `${TEST_SITE_ID}/video/${TEST_CONTENT_ID}/v1/${SPECIAL_FILENAME}`,
        fileSize: 2048,
        hash: 'mov-hash',
      });
      mockKnex._setTableData('users', [{ ...CONTENT_MANAGER, token_valid_after: null }]);
      mockKnex._setTableData('content', [{
        ...testContent,
        name: 'My Clip',
      }]);
      mockKnex._setTableData('content_versions', [{
        id: 'v-mov',
        content_id: TEST_CONTENT_ID,
        version_number: 1,
        file_path: `${TEST_SITE_ID}/video/${TEST_CONTENT_ID}/v1/${SPECIAL_FILENAME}`,
        file_size: 2048,
        hash: 'mov-hash',
        metadata: { originalName: SPECIAL_FILENAME, mimeType: 'video/quicktime' },
      }]);

      const res = await request(app)
        .post('/api/content')
        .set('Authorization', `Bearer ${token}`)
        .field('site_id', TEST_SITE_ID)
        .field('name', 'My Clip')
        .field('description', 'QuickTime upload')
        .attach('file', Buffer.from('fake mov content'), {
          filename: SPECIAL_FILENAME,
          contentType: 'application/octet-stream',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('video');
      expect(res.body.data.metadata).toEqual({
        originalName: SPECIAL_FILENAME,
        mimeType: 'video/quicktime',
      });
      expect(res.body.data.url).toBe(
        `/storage/${TEST_SITE_ID}/video/${TEST_CONTENT_ID}/v1/${ENCODED_SPECIAL_FILENAME}`
      );
    });
  });

  describe('GET /api/content/:id', () => {
    it('returns 404 for non-existent content', async () => {
      const token = generateTestToken(SUPER_ADMIN);
      mockKnex._setTableData('users', [{ ...SUPER_ADMIN, token_valid_after: null }]);
      mockKnex._setTableData('content', []);

      const res = await request(app)
        .get(`/api/content/${TEST_CONTENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with content details', async () => {
      const token = generateTestToken(SUPER_ADMIN);
      mockKnex._setTableData('users', [{ ...SUPER_ADMIN, token_valid_after: null }]);
      mockKnex._setTableData('content', [testContent]);

      const res = await request(app)
        .get(`/api/content/${TEST_CONTENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBe(TEST_CONTENT_ID);
    });

    it('returns encoded detail URLs for symbol-heavy filenames', async () => {
      const token = generateTestToken(SUPER_ADMIN);
      mockKnex._setTableData('users', [{ ...SUPER_ADMIN, token_valid_after: null }]);
      mockKnex._setTableData('content', [{
        ...testContent,
        file_path: `${TEST_SITE_ID}/video/${TEST_CONTENT_ID}/v1/${SPECIAL_FILENAME}`,
        metadata: { originalName: SPECIAL_FILENAME, mimeType: 'video/quicktime' },
      }]);

      const res = await request(app)
        .get(`/api/content/${TEST_CONTENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.url).toBe(
        `/storage/${TEST_SITE_ID}/video/${TEST_CONTENT_ID}/v1/${ENCODED_SPECIAL_FILENAME}`
      );
    });
  });

  describe('PUT /api/content/:id', () => {
    it('returns 404 for non-existent content', async () => {
      const token = generateTestToken(SUPER_ADMIN);
      mockKnex._setTableData('users', [{ ...SUPER_ADMIN, token_valid_after: null }]);
      mockKnex._setTableData('content', []);

      const res = await request(app)
        .put(`/api/content/${TEST_CONTENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 with updated content', async () => {
      const token = generateTestToken(SUPER_ADMIN);
      mockKnex._setTableData('users', [{ ...SUPER_ADMIN, token_valid_after: null }]);
      mockKnex._setTableData('content', [testContent]);

      const res = await request(app)
        .put(`/api/content/${TEST_CONTENT_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Video Name', description: 'Updated description', is_active: true });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });

  describe('DELETE /api/content/:id', () => {
    it('returns 403 for operator role', async () => {
      const token = generateTestToken(OPERATOR);
      mockKnex._setTableData('users', [{ ...OPERATOR, token_valid_after: null }]);
      mockKnex._setTableData('content', [testContent]);

      const res = await request(app)
        .delete(`/api/content/${TEST_CONTENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('returns 200 on successful soft delete', async () => {
      const token = generateTestToken(SUPER_ADMIN);
      mockKnex._setTableData('users', [{ ...SUPER_ADMIN, token_valid_after: null }]);
      mockKnex._setTableData('content', [testContent]);

      const res = await request(app)
        .delete(`/api/content/${TEST_CONTENT_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
