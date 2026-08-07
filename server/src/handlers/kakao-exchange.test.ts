import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';

import {
  KakaoLoginRejectedError,
  KakaoProviderUnavailableError,
} from '../auth/kakao';
import { createKakaoExchangeHandler } from './kakao-exchange';

const event = (body: unknown): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'POST /v1/auth/kakao/exchange',
    rawPath: '/v1/auth/kakao/exchange',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {},
    isBase64Encoded: false,
    body: JSON.stringify(body),
  }) as unknown as APIGatewayProxyEventV2;

const validBody = {
  code: 'authorization-code',
  redirectUri: 'https://example.com/auth/kakao',
  nonce: '0123456789abcdef0123456789abcdef',
};

const createDependencies = () => ({
  authenticate: vi.fn().mockResolvedValue({ subject: 'kakao-subject' }),
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

describe('POST /v1/auth/kakao/exchange', () => {
  it('creates a Loofit user session after Kakao verification', async () => {
    const dependencies = createDependencies();
    const handler = createKakaoExchangeHandler(dependencies);

    const response = await handler(event(validBody), 'request-id');

    expect(response).toMatchObject({ statusCode: 200 });
    expect(JSON.parse(response.body!)).toEqual({
      tokenType: 'Bearer',
      accessToken: 'access-token',
      expiresIn: 900,
      refreshToken: 'refresh-token',
      refreshTokenExpiresIn: 2_592_000,
      user: { id: 'user-id', created: true },
    });
    expect(dependencies.findOrCreateUser).toHaveBeenCalledWith('kakao-subject');
    expect(dependencies.createSession).toHaveBeenCalledWith('user-id');
    expect(dependencies.issueAccessToken).toHaveBeenCalledWith({
      userId: 'user-id',
      sessionId: 'session-id',
    });
  });

  it('accepts a native Kakao SDK ID token without REST callback fields', async () => {
    const dependencies = createDependencies();
    const handler = createKakaoExchangeHandler(dependencies);

    const response = await handler(event({ idToken: 'signed-native-id-token' }), 'id');

    expect(response).toMatchObject({ statusCode: 200 });
    expect(dependencies.authenticate).toHaveBeenCalledWith({
      idToken: 'signed-native-id-token',
    });
  });

  it('rejects malformed input before any provider request', async () => {
    const dependencies = createDependencies();
    const handler = createKakaoExchangeHandler(dependencies);
    const response = await handler(event({ ...validBody, nonce: 'short' }), 'id');

    expect(response).toMatchObject({ statusCode: 400 });
    expect(JSON.parse(response.body!).error.code).toBe('INVALID_REQUEST');
    expect(dependencies.authenticate).not.toHaveBeenCalled();
  });

  it('returns uniform errors for rejected credentials and Kakao outages', async () => {
    const rejectedDependencies = createDependencies();
    rejectedDependencies.authenticate.mockRejectedValue(
      new KakaoLoginRejectedError('provider detail')
    );
    const rejected = await createKakaoExchangeHandler(rejectedDependencies)(
      event(validBody),
      'id'
    );
    expect(rejected).toMatchObject({ statusCode: 401 });
    expect(rejected.body).not.toContain('provider detail');

    const unavailableDependencies = createDependencies();
    unavailableDependencies.authenticate.mockRejectedValue(
      new KakaoProviderUnavailableError()
    );
    const unavailable = await createKakaoExchangeHandler(
      unavailableDependencies
    )(event(validBody), 'id');
    expect(unavailable).toMatchObject({ statusCode: 503 });
  });

  it('reports unexpected failures without exposing details to the client', async () => {
    const dependencies = createDependencies();
    dependencies.createSession.mockRejectedValue(new Error('database detail'));
    const response = await createKakaoExchangeHandler(dependencies)(
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
