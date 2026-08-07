import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';

import { RefreshTokenRejectedError } from '../auth/repository';
import { createRefreshHandler } from './refresh';

const event = (body: unknown): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'POST /v1/auth/refresh',
    rawPath: '/v1/auth/refresh',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {},
    isBase64Encoded: false,
    body: JSON.stringify(body),
  }) as unknown as APIGatewayProxyEventV2;

const createDependencies = () => ({
  rotateRefreshToken: vi.fn().mockResolvedValue({
    userId: 'user-id',
    sessionId: 'session-id',
    refreshToken: 'next-refresh-token',
    refreshTokenExpiresIn: 2_592_000,
  }),
  issueAccessToken: vi.fn().mockResolvedValue({
    accessToken: 'next-access-token',
    expiresIn: 900,
  }),
  reportUnexpectedError: vi.fn(),
});

describe('POST /v1/auth/refresh', () => {
  it('atomically rotates the Refresh Token before issuing a new Access Token', async () => {
    const dependencies = createDependencies();
    const handler = createRefreshHandler(dependencies);

    const response = await handler(
      event({ refreshToken: 'current-refresh-token' }),
      'request-id'
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body!)).toEqual({
      tokenType: 'Bearer',
      accessToken: 'next-access-token',
      expiresIn: 900,
      refreshToken: 'next-refresh-token',
      refreshTokenExpiresIn: 2_592_000,
    });
    expect(dependencies.rotateRefreshToken).toHaveBeenCalledWith(
      'current-refresh-token'
    );
    expect(dependencies.issueAccessToken).toHaveBeenCalledWith({
      userId: 'user-id',
      sessionId: 'session-id',
    });
  });

  it('rejects malformed input before accessing the session store', async () => {
    const dependencies = createDependencies();
    const response = await createRefreshHandler(dependencies)(
      event({ refreshToken: '' }),
      'request-id'
    );

    expect(response.statusCode).toBe(400);
    expect(dependencies.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('maps expired, replayed, and revoked credentials to the same 401 response', async () => {
    const dependencies = createDependencies();
    dependencies.rotateRefreshToken.mockRejectedValue(
      new RefreshTokenRejectedError()
    );
    const response = await createRefreshHandler(dependencies)(
      event({ refreshToken: 'replayed-refresh-token' }),
      'request-id'
    );

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body!).error.code).toBe(
      'REFRESH_TOKEN_REJECTED'
    );
  });

  it('does not expose unexpected storage or KMS errors', async () => {
    const dependencies = createDependencies();
    dependencies.issueAccessToken.mockRejectedValue(new Error('kms detail'));
    const response = await createRefreshHandler(dependencies)(
      event({ refreshToken: 'current-refresh-token' }),
      'request-id'
    );

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('kms detail');
    expect(dependencies.reportUnexpectedError).toHaveBeenCalledWith(
      expect.any(Error),
      'request-id'
    );
  });
});
