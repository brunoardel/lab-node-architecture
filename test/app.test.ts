import { describe, it, expect, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Base Server Application', () => {
  const app = buildApp({ logger: false });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 with status ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      status: string;
      uptime: number;
      timestamp: string;
    };
    expect(body.status).toBe('ok');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.timestamp).toBe('string');
  });

  it('GET /non-existent returns 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/non-existent',
    });

    expect(response.statusCode).toBe(404);
  });
});
