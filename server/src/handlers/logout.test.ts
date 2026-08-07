import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';

import { createLogoutHandler } from './logout';

const event = (body: unknown): APIGatewayProxyEventV2 =>
  ({
    body: JSON.stringify(body),
    isBase64Encoded: false,
  }) as APIGatewayProxyEventV2;

describe('POST /v1/auth/logout', () => {
  it('revokes the current refresh session without returning credentials', async () => {
    const revokeSession = vi.fn(async () => undefined);
    const response = await createLogoutHandler({ revokeSession })(
      event({ refreshToken: 'refresh-token' }),
      'request-id'
    );

    expect(revokeSession).toHaveBeenCalledWith('refresh-token');
    expect(response).toEqual({
      statusCode: 204,
      headers: {
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  });

  it('rejects malformed input before accessing the session store', async () => {
    const revokeSession = vi.fn();
    const response = await createLogoutHandler({ revokeSession })(
      event({ refreshToken: '' }),
      'request-id'
    );

    expect(response).toMatchObject({ statusCode: 400 });
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it('maps unexpected storage failures to a generic server error', async () => {
    const reportUnexpectedError = vi.fn();
    const response = await createLogoutHandler({
      revokeSession: vi.fn(async () => {
        throw new Error('secret storage detail');
      }),
      reportUnexpectedError,
    })(event({ refreshToken: 'refresh-token' }), 'request-id');

    expect(response).toMatchObject({ statusCode: 500 });
    expect(response.body).not.toContain('secret storage detail');
    expect(reportUnexpectedError).toHaveBeenCalledWith(
      expect.any(Error),
      'request-id'
    );
  });
});
