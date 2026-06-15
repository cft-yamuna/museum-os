import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { getTestApp } from '../helpers/testApp.js';
import { getDb } from '../../lib/db.js';
import { createMockKnex } from '../helpers/mockDb.js';
import { generateTestToken, SUPER_ADMIN, TEST_SITE_ID } from '../helpers/auth.js';
import { isTokenRevoked, revokeToken } from '../../services/tokenRevocation.js';

let app: ReturnType<typeof getTestApp>;
let mockKnex: ReturnType<typeof createMockKnex>;
let testPasswordHash: string;

const TEST_USER = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  email: 'test@lightman.local',
  name: 'Test User',
  role: 'super_admin',
  password_hash: '',
  is_active: true,
  site_ids: [TEST_SITE_ID],
  token_valid_after: null,
};

beforeAll(async () => {
  testPasswordHash = await bcrypt.hash('password123', 4);
  TEST_USER.password_hash = testPasswordHash;
});

beforeEach(() => {
  app = getTestApp();
  mockKnex = createMockKnex();
  vi.mocked(getDb).mockReturnValue(mockKnex as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// NOTE: Login route has express-rate-limit (5/min per IP, shared module-level).
// Tests are sequenced to stay within the limit. The rate limit test is last.

describe('POST /api/auth/login', () => {
  // Request 1 of 5
  it('returns 200 with token and user on success', async () => {
    mockKnex._setTableData('users', [{ ...TEST_USER }]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user.email).toBe(TEST_USER.email);
    expect(res.body.data.user.name).toBe(TEST_USER.name);
    expect(res.body.data.user.role).toBe(TEST_USER.role);

    // Also verify JWT payload fields (avoids a second request)
    const token = res.body.data.token;
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString()
    );
    expect(payload).toHaveProperty('id', TEST_USER.id);
    expect(payload).toHaveProperty('email', TEST_USER.email);
    expect(payload).toHaveProperty('jti');
    expect(payload).toHaveProperty('site_ids');
  });

  // Request 2 of 5
  it('returns 401 for non-existent user', async () => {
    mockKnex._setTableData('users', []);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@lightman.local', password: 'password123' });
    expect(res.status).toBe(401);
  });

  // Request 3 of 5
  it('returns 401 for inactive user', async () => {
    mockKnex._setTableData('users', [{ ...TEST_USER, is_active: false }]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/inactive/i);
  });

  // Request 4 of 5
  it('returns 401 for wrong password', async () => {
    mockKnex._setTableData('users', [{ ...TEST_USER }]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  // Request 5 of 5
  it('returns 400 for invalid body (missing email)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'password123' });
    expect(res.status).toBe(400);
  });

  // Request 6+ — rate limiter kicks in
  it('returns 429 after exceeding rate limit', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'spam@test.com', password: 'wrong' });
    expect(res.status).toBe(429);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns 401 without auth header', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('returns 200 with new token for valid auth', async () => {
    mockKnex._setTableData('users', [{ token_valid_after: null }]);

    const token = generateTestToken(SUPER_ADMIN);
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.token).not.toBe(token);
  });

  it('revokes old JTI after refresh', async () => {
    mockKnex._setTableData('users', [{ token_valid_after: null }]);

    const token = generateTestToken(SUPER_ADMIN);
    const oldPayload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString()
    );

    await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${token}`);

    expect(vi.mocked(revokeToken)).toHaveBeenCalledWith(
      oldPayload.jti,
      expect.any(Date),
    );
  });

  it('rejects old token JTI after refresh', async () => {
    mockKnex._setTableData('users', [{ token_valid_after: null }]);

    const token = generateTestToken(SUPER_ADMIN);

    await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${token}`);

    // Simulate that the old JTI is now revoked in the DB
    vi.mocked(isTokenRevoked).mockResolvedValueOnce(true);

    mockKnex._setTableData('users', [{ token_valid_after: null }]);
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without auth header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 200 with user payload for valid auth', async () => {
    mockKnex._setTableData('users', [{ token_valid_after: null }]);

    const token = generateTestToken(SUPER_ADMIN);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('email');
    expect(res.body.data).toHaveProperty('role');
  });
});
