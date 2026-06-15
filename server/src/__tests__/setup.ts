/**
 * Global test setup — runs before any test file is imported.
 * Sets required env vars so env.ts Zod parse doesn't call process.exit(1).
 */

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/lightman_test';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-16-chars';
process.env.JWT_EXPIRY = '1h';
process.env.STORAGE_PATH = '/tmp/lightman-test-storage';
process.env.CORS_ORIGIN = 'http://localhost:3000';
