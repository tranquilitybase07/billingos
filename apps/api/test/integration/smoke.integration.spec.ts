import { createTestApp, TestApp } from '../setup/test-app';
import request from 'supertest';

describe('integration harness smoke test', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('app boots and binds to the configured port', () => {
    expect(ctx.port).toBeGreaterThan(0);
    expect(ctx.baseUrl).toBe(`http://localhost:${ctx.port}`);
  });

  it('responds to unknown routes with 404', async () => {
    const res = await request(ctx.app.getHttpServer()).get(
      '/__nonexistent_route__',
    );
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated requests to guarded endpoints with 401', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/v1/customer/me');
    expect(res.status).toBe(401);
  });
});
