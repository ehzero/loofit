import { describe, expect, it } from 'vitest';

import { handler } from './health';

describe('health handler', () => {
  it('returns a non-cacheable production health response', async () => {
    process.env.APP_ENV = 'production';

    const response = await handler(
      { rawPath: '/health' } as never,
      { awsRequestId: 'request-123' } as never,
      () => undefined
    );

    expect(response).toBeDefined();
    if (!response || typeof response === 'string') {
      throw new Error('Expected an API Gateway v2 response object.');
    }

    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    expect(JSON.parse(response.body ?? '{}')).toEqual({
      service: 'loofit-server',
      status: 'ok',
      environment: 'production',
      requestId: 'request-123',
      path: '/health',
    });
  });
});
