/**
 * Test auth helpers — generates real JWTs signed with the test secret.
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const TEST_JWT_SECRET = 'test-jwt-secret-at-least-16-chars';

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: string;
  site_ids: string[] | null;
  jti?: string;
  iat?: number;
}

// --- Reusable test user fixtures ---

export const SUPER_ADMIN: TestUser = {
  id: 'a0000000-0000-0000-0000-000000000001',
  email: 'admin@museumos.local',
  name: 'Super Admin',
  role: 'super_admin',
  site_ids: null,
};

export const SITE_ADMIN: TestUser = {
  id: 'a0000000-0000-0000-0000-000000000002',
  email: 'siteadmin@museumos.local',
  name: 'Site Admin',
  role: 'site_admin',
  site_ids: ['b0000000-0000-0000-0000-000000000001'],
};

export const CONTENT_MANAGER: TestUser = {
  id: 'a0000000-0000-0000-0000-000000000003',
  email: 'content@museumos.local',
  name: 'Content Manager',
  role: 'content_manager',
  site_ids: ['b0000000-0000-0000-0000-000000000001'],
};

export const OPERATOR: TestUser = {
  id: 'a0000000-0000-0000-0000-000000000004',
  email: 'operator@museumos.local',
  name: 'Operator',
  role: 'operator',
  site_ids: ['b0000000-0000-0000-0000-000000000001'],
};

export const TEST_SITE_ID = 'b0000000-0000-0000-0000-000000000001';
export const TEST_DEVICE_ID = 'c0000000-0000-0000-0000-000000000001';
export const TEST_CONTENT_ID = 'd0000000-0000-0000-0000-000000000001';
export const TEST_PLAYLIST_ID = 'e0000000-0000-0000-0000-000000000001';

/**
 * Generate a real JWT signed with the test secret.
 * Optionally override payload fields.
 */
export function generateTestToken(
  user: TestUser = SUPER_ADMIN,
  overrides?: Partial<TestUser> & { expiresIn?: string }
): string {
  const { expiresIn, ...rest } = overrides || {};
  const payload = {
    ...user,
    ...rest,
    jti: rest.jti ?? user.jti ?? crypto.randomUUID(),
  };

  return jwt.sign(payload, TEST_JWT_SECRET, {
    expiresIn: (expiresIn || '1h') as any,
  });
}

/**
 * Generate an expired token for testing expiry handling.
 */
export function generateExpiredToken(user: TestUser = SUPER_ADMIN): string {
  return jwt.sign(
    { ...user, jti: crypto.randomUUID() },
    TEST_JWT_SECRET,
    { expiresIn: '-1s' as any }
  );
}

/**
 * Create Authorization header value for a given user.
 */
export function authHeader(user: TestUser = SUPER_ADMIN): string {
  return `Bearer ${generateTestToken(user)}`;
}
