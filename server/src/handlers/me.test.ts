import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';

import { createMeHandler } from './me';

const eventWithClaims = (
  claims: Record<string, string>
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    requestContext: {
      authorizer: {
        jwt: { claims, scopes: [] },
      },
    },
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

describe('GET /v1/me', () => {
  it('returns the active account provider without exposing identity details', async () => {
    const getAccount = vi.fn().mockResolvedValue({
      user: {
        userId: 'user-id',
        status: 'ACTIVE',
        createdAt: '2026-08-07T00:00:00.000Z',
        updatedAt: '2026-08-07T00:00:00.000Z',
      },
      identities: [
        {
          provider: 'KAKAO',
          subjectHash: 'hidden',
          userId: 'user-id',
          createdAt: '2026-08-07T00:00:00.000Z',
        },
      ],
    });
    const response = await createMeHandler({ getAccount })(
      eventWithClaims({ sub: 'user-id', sid: 'session-id', email: 'hidden' }),
      'request-id'
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body!)).toEqual({
      user: { id: 'user-id' },
      session: { id: 'session-id' },
      provider: 'KAKAO',
    });
  });

  it('rejects authorizer contexts without required private claims', async () => {
    const response = await createMeHandler({ getAccount: vi.fn() })(
      eventWithClaims({ sub: 'user-id' }),
      'request-id'
    );
    expect(response.statusCode).toBe(401);
  });

  it('rejects accounts already being deleted', async () => {
    const response = await createMeHandler({
      getAccount: vi.fn().mockResolvedValue({
        user: {
          userId: 'user-id',
          status: 'DELETING',
          createdAt: '2026-08-07T00:00:00.000Z',
          updatedAt: '2026-08-07T00:00:00.000Z',
        },
        identities: [],
      }),
    })(
      eventWithClaims({ sub: 'user-id', sid: 'session-id' }),
      'request-id'
    );
    expect(response.statusCode).toBe(401);
  });
});
