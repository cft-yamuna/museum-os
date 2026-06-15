import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { getTestApp } from '../helpers/testApp.js';

describe('display routes', () => {
  const app = getTestApp();

  it('serves the display SPA index for app routes', async () => {
    const res = await request(app).get('/display/a-av01');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('does not serve the SPA index for missing display assets', async () => {
    const res = await request(app).get('/display/assets/does-not-exist.js');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
