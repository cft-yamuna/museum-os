import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getTestApp } from '../helpers/testApp.js';
import { authHeader, SUPER_ADMIN } from '../helpers/auth.js';
import { getDb } from '../../lib/db.js';
import { createMockKnex } from '../helpers/mockDb.js';

describe('GET /api/health', () => {
  const app = getTestApp();

  it('returns 200 with ok status when db is connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.database).toBe('connected');
    expect(res.body.data.version).toBeDefined();
    expect(res.body.data.uptime).toBeTypeOf('number');
    expect(res.body.data.memory).toBeDefined();
  });

  it('returns degraded status when db check fails', async () => {
    const { checkDbConnection } = await import('../../lib/db.js');
    vi.mocked(checkDbConnection).mockResolvedValueOnce(false);

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.database).toBe('disconnected');
  });
});

describe('GET /api/health/detailed', () => {
  const app = getTestApp();
  let mockKnex: ReturnType<typeof createMockKnex>;

  beforeEach(() => {
    mockKnex = createMockKnex();
    vi.mocked(getDb).mockReturnValue(mockKnex as any);
    // Mock users table for auth middleware (token_valid_after check)
    mockKnex._setTableData('users', [{ token_valid_after: null }]);
  });

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/health/detailed');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-super_admin', async () => {
    const res = await request(app)
      .get('/api/health/detailed')
      .set('Authorization', authHeader({ ...SUPER_ADMIN, role: 'operator' }));
    expect(res.status).toBe(403);
  });

  it('returns detailed health for super_admin', async () => {
    const res = await request(app)
      .get('/api/health/detailed')
      .set('Authorization', authHeader(SUPER_ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.data.services).toBeDefined();
    expect(res.body.data.system).toBeDefined();
    expect(res.body.data.scheduler).toBeDefined();
    expect(res.body.data.disk).toBeDefined();
  });
});
