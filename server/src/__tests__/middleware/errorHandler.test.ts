import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../middleware/errorHandler.js';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from '../../lib/errors.js';
import { z, ZodError } from 'zod';

function createErrorApp(error: Error): express.Express {
  const app = express();
  app.get('/test', (_req, _res, next) => next(error));
  app.use(errorHandler);
  return app;
}

describe('Error Handler Middleware', () => {
  it('handles ZodError with 400 and validation details', async () => {
    const schema = z.object({
      email: z.string().email(),
      age: z.number().min(0),
    });

    let zodError!: ZodError;
    try {
      schema.parse({ email: 'not-an-email', age: -5 });
    } catch (err) {
      zodError = err as ZodError;
    }

    const app = createErrorApp(zodError);
    const res = await request(app).get('/test');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it('handles AppError with correct statusCode and code', async () => {
    // AppError(statusCode, message, code)
    const error = new AppError(422, 'Custom error occurred', 'CUSTOM_CODE');
    const app = createErrorApp(error);
    const res = await request(app).get('/test');

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CUSTOM_CODE');
    expect(res.body.error).toBe('Custom error occurred');
  });

  it('handles NotFoundError with 404', async () => {
    // NotFoundError(resource, id?)
    const error = new NotFoundError('Device', 'abc-123');
    const app = createErrorApp(error);
    const res = await request(app).get('/test');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.error).toMatch(/Device/);
  });

  it('handles UnauthorizedError with 401', async () => {
    const error = new UnauthorizedError('Invalid credentials');
    const app = createErrorApp(error);
    const res = await request(app).get('/test');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('handles ForbiddenError with 403', async () => {
    const error = new ForbiddenError('Access denied');
    const app = createErrorApp(error);
    const res = await request(app).get('/test');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(res.body.error).toBe('Access denied');
  });

  it('handles "File too large" error with 413', async () => {
    const error = new Error('File too large');
    const app = createErrorApp(error);
    const res = await request(app).get('/test');

    expect(res.status).toBe(413);
    expect(res.body.code).toBe('FILE_TOO_LARGE');
  });

  it('handles unknown Error with 500', async () => {
    const error = new Error('Something unexpected happened');
    const app = createErrorApp(error);
    const res = await request(app).get('/test');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });
});
