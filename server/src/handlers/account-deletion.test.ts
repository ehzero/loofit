import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';

import { hashProviderSubject } from '../auth/model';
import { createAccountDeletionHandler } from './account-deletion';

const event = (body: unknown): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    body: JSON.stringify(body),
    requestContext: {
      authorizer: {
        jwt: { claims: { sub: 'user-1' }, scopes: [] },
      },
    },
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

const activeAccount = {
  user: {
    userId: 'user-1',
    status: 'ACTIVE' as const,
    createdAt: '2026-08-07T00:00:00.000Z',
    updatedAt: '2026-08-07T00:00:00.000Z',
  },
  identities: [
    {
      provider: 'KAKAO' as const,
      subjectHash: hashProviderSubject('KAKAO', '1234'),
      userId: 'user-1',
      createdAt: '2026-08-07T00:00:00.000Z',
    },
  ],
};

const dependencies = () => ({
  getAccount: vi.fn().mockResolvedValue(activeAccount),
  beginDeletion: vi.fn().mockResolvedValue(undefined),
  rollbackDeletion: vi.fn().mockResolvedValue(undefined),
  verifyAndUnlink: vi.fn().mockResolvedValue(undefined),
  enqueue: vi.fn().mockResolvedValue(undefined),
  createRequestId: () => 'deletion-request-1',
  reportUnexpectedError: vi.fn(),
});

describe('POST /v1/account/deletion', () => {
  it('marks, unlinks, and queues permanent deletion after reauthentication', async () => {
    const deps = dependencies();
    const response = await createAccountDeletionHandler(deps)(
      event({
        provider: 'KAKAO',
        idToken: 'id-token',
        accessToken: 'access-token',
      }),
      'request-id'
    );

    expect(response.statusCode).toBe(202);
    expect(deps.beginDeletion).toHaveBeenCalledWith(
      'user-1',
      'deletion-request-1'
    );
    expect(deps.verifyAndUnlink).toHaveBeenCalledWith(
      {
        provider: 'KAKAO',
        idToken: 'id-token',
        accessToken: 'access-token',
      },
      activeAccount.identities[0].subjectHash
    );
    expect(deps.enqueue).toHaveBeenCalledWith(
      'user-1',
      'deletion-request-1'
    );
    expect(deps.rollbackDeletion).not.toHaveBeenCalled();
  });

  it('rolls back the deleting state when durable queueing fails', async () => {
    const deps = dependencies();
    deps.enqueue.mockRejectedValue(new Error('queue unavailable'));
    const response = await createAccountDeletionHandler(deps)(
      event({
        provider: 'KAKAO',
        idToken: 'id-token',
        accessToken: 'access-token',
      }),
      'request-id'
    );

    expect(response.statusCode).toBe(500);
    expect(deps.rollbackDeletion).toHaveBeenCalledWith(
      'user-1',
      'deletion-request-1'
    );
  });

  it('rejects a proof from a provider other than the account identity', async () => {
    const deps = dependencies();
    const response = await createAccountDeletionHandler(deps)(
      event({
        provider: 'APPLE',
        idToken: 'id-token',
        nonce: '0123456789abcdef',
        authorizationCode: 'authorization-code',
      }),
      'request-id'
    );

    expect(response.statusCode).toBe(401);
    expect(deps.beginDeletion).not.toHaveBeenCalled();
    expect(deps.verifyAndUnlink).not.toHaveBeenCalled();
  });

  it('returns the same accepted state for an account already deleting', async () => {
    const deps = dependencies();
    deps.getAccount.mockResolvedValue({
      ...activeAccount,
      user: { ...activeAccount.user, status: 'DELETING' },
    });
    const response = await createAccountDeletionHandler(deps)(
      event({
        provider: 'KAKAO',
        idToken: 'id-token',
        accessToken: 'access-token',
      }),
      'request-id'
    );

    expect(response.statusCode).toBe(202);
    expect(deps.beginDeletion).not.toHaveBeenCalled();
  });
});
