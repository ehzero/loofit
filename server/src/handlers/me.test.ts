import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it } from 'vitest';

import { handler } from './me';

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
  it('returns only the JWT user and session identifiers', async () => {
    const response = await handler(
      eventWithClaims({ sub: 'user-id', sid: 'session-id', email: 'hidden' })
    );

    expect(response).toMatchObject({ statusCode: 200 });
    expect(JSON.parse(response.body!)).toEqual({
      user: { id: 'user-id' },
      session: { id: 'session-id' },
    });
  });

  it('rejects authorizer contexts without required private claims', async () => {
    const response = await handler(eventWithClaims({ sub: 'user-id' }));
    expect(response).toMatchObject({ statusCode: 401 });
  });
});
