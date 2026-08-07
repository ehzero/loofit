import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';

import { AppleLoginRejectedError } from '../auth/apple';
import { createAppleExchangeHandler } from './apple-exchange';

const event = (body: unknown): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'POST /v1/auth/apple/exchange',
    rawPath: '/v1/auth/apple/exchange',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {},
    isBase64Encoded: false,
    body: JSON.stringify(body),
  }) as unknown as APIGatewayProxyEventV2;

const validBody = {
  idToken: 'signed-apple-id-token',
  nonce: '0123456789abcdef0123456789abcdef',
};

const createDependencies = () => ({
  authenticate: vi.fn().mockResolvedValue({ subject: 'apple-subject' }),
  findOrCreateUser: vi
    .fn()
    .mockResolvedValue({ userId: 'user-id', created: true }),
  createSession: vi.fn().mockResolvedValue({
    sessionId: 'session-id',
    refreshToken: 'refresh-token',
    refreshTokenExpiresIn: 2_592_000,
  }),
  issueAccessToken: vi.fn().mockResolvedValue({
    accessToken: 'access-token',
    expiresIn: 900,
  }),
  reportUnexpectedError: vi.fn(),
});

describe('POST /v1/auth/apple/exchange', () => {
  it('creates a separate Apple-backed Loofit session', async () => {
    const dependencies = createDependencies();
    const response = await createAppleExchangeHandler(dependencies)(
      event(validBody),
      'request-id'
    );

    expect(response).toMatchObject({ statusCode: 200 });
    expect(JSON.parse(response.body!)).toEqual({
      tokenType: 'Bearer',
      accessToken: 'access-token',
      expiresIn: 900,
      refreshToken: 'refresh-token',
      refreshTokenExpiresIn: 2_592_000,
      user: { id: 'user-id', created: true },
    });
    expect(dependencies.authenticate).toHaveBeenCalledWith(validBody);
    expect(dependencies.findOrCreateUser).toHaveBeenCalledWith('apple-subject');
  });

  it('rejects malformed nonce before token verification', async () => {
    const dependencies = createDependencies();
    const response = await createAppleExchangeHandler(dependencies)(
      event({ ...validBody, nonce: 'short' }),
      'request-id'
    );

    expect(response).toMatchObject({ statusCode: 400 });
    expect(dependencies.authenticate).not.toHaveBeenCalled();
  });

  it('returns a uniform error for rejected Apple credentials', async () => {
    const dependencies = createDependencies();
    dependencies.authenticate.mockRejectedValue(
      new AppleLoginRejectedError('provider detail')
    );
    const response = await createAppleExchangeHandler(dependencies)(
      event(validBody),
      'request-id'
    );

    expect(response).toMatchObject({ statusCode: 401 });
    expect(JSON.parse(response.body!).error.code).toBe('APPLE_LOGIN_REJECTED');
    expect(response.body).not.toContain('provider detail');
  });

  it('reports unexpected failures without exposing details', async () => {
    const dependencies = createDependencies();
    dependencies.createSession.mockRejectedValue(new Error('database detail'));
    const response = await createAppleExchangeHandler(dependencies)(
      event(validBody),
      'request-id'
    );

    expect(response).toMatchObject({ statusCode: 500 });
    expect(response.body).not.toContain('database detail');
    expect(dependencies.reportUnexpectedError).toHaveBeenCalledWith(
      expect.any(Error),
      'request-id'
    );
  });
});
