import { Readable } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/testApp.js';
import { getStorage } from '../../services/storageBackend.js';
import { TEST_CONTENT_ID, TEST_SITE_ID } from '../helpers/auth.js';

const SPECIAL_FILENAME = 'My Clip #1 (final)+é.mov';
const ENCODED_SPECIAL_FILENAME = 'My%20Clip%20%231%20(final)%2B%C3%A9.mov';

describe('Routes: /storage', () => {
  let app: ReturnType<typeof getTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = getTestApp();
  });

  it('serves percent-encoded filenames and returns video/quicktime for MOV files', async () => {
    const storage = {
      storeFile: vi.fn(),
      getFileStream: vi.fn().mockResolvedValue(Readable.from(Buffer.from('movie'))),
      getFileStreamRange: vi.fn(),
      deleteFile: vi.fn(),
      getFileStats: vi.fn().mockResolvedValue({
        size: 5,
        mtime: new Date('2026-04-28T00:00:00.000Z'),
      }),
      fileExists: vi.fn().mockResolvedValue(true),
      listFiles: vi.fn(),
      getDiskSpace: vi.fn(),
    };
    vi.mocked(getStorage).mockReturnValue(storage as any);

    const res = await request(app).get(
      `/storage/${TEST_SITE_ID}/video/${TEST_CONTENT_ID}/v1/${ENCODED_SPECIAL_FILENAME}`
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('video/quicktime');
    expect(storage.fileExists).toHaveBeenCalledWith(
      `${TEST_SITE_ID}/video/${TEST_CONTENT_ID}/v1/${SPECIAL_FILENAME}`
    );
  });

  it('rejects traversal-like filenames', async () => {
    const res = await request(app).get(
      `/storage/${TEST_SITE_ID}/video/${TEST_CONTENT_ID}/v1/..%5Csecret.mov`
    );

    expect(res.status).toBe(400);
    expect(vi.mocked(getStorage)).not.toHaveBeenCalled();
  });
});
