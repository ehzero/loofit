import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';

import {
  AUTH_ENTITY_TYPES,
  createAuthIdentityItem,
  createAuthSessionItem,
  createAuthUserProfileItem,
  createRefreshToken,
  hashRefreshToken,
} from './model';
import {
  AccountDeletionInProgressError,
  AuthRepository,
  RefreshTokenRejectedError,
} from './repository';

const NOW = new Date('2026-08-07T00:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const SUBJECT = 'kakao-user-123';
const CURRENT_SECRET = 'A'.repeat(43);
const NEXT_SECRET = 'B'.repeat(43);

const createRepository = (
  send: ReturnType<typeof vi.fn>,
  refreshSecret = CURRENT_SECRET
) =>
  new AuthRepository({
    client: { send } as never,
    tableName: 'loofit-production-user-data',
    byUserIndexName: 'byUser',
    now: () => NOW,
    createUserId: () => USER_ID,
    createSessionId: () => SESSION_ID,
    createRefreshSecret: () => refreshSecret,
  });

describe('auth repository', () => {
  it('atomically creates one user and one identity without the raw subject', async () => {
    const send = vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const result = await createRepository(send).findOrCreateUser('KAKAO', SUBJECT);

    expect(result.created).toBe(true);
    expect(result.user.userId).toBe(USER_ID);
    expect(result.identity.provider).toBe('KAKAO');
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetCommand);
    const transaction = send.mock.calls[1]?.[0] as TransactWriteCommand;
    expect(transaction).toBeInstanceOf(TransactWriteCommand);
    expect(transaction.input.TransactItems).toHaveLength(2);
    expect(JSON.stringify(transaction.input)).not.toContain(SUBJECT);
    expect(transaction.input.TransactItems?.[1]?.Put?.ConditionExpression).toContain(
      'attribute_not_exists'
    );
  });

  it('returns the existing user for the same provider identity', async () => {
    const createdAt = NOW.toISOString();
    const identity = createAuthIdentityItem('KAKAO', SUBJECT, USER_ID, createdAt);
    const user = createAuthUserProfileItem(USER_ID, createdAt);
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Item: identity })
      .mockResolvedValueOnce({ Item: user });

    const result = await createRepository(send).findOrCreateUser('KAKAO', SUBJECT);

    expect(result).toMatchObject({ created: false, user: { userId: USER_ID } });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('rejects login while the existing account is being deleted', async () => {
    const createdAt = NOW.toISOString();
    const identity = createAuthIdentityItem('KAKAO', SUBJECT, USER_ID, createdAt);
    const user = {
      ...createAuthUserProfileItem(USER_ID, createdAt),
      status: 'DELETING',
      deletionRequestId: 'request-1',
      deletionRequestedAt: createdAt,
    };
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Item: identity })
      .mockResolvedValueOnce({ Item: user });

    await expect(
      createRepository(send).findOrCreateUser('KAKAO', SUBJECT)
    ).rejects.toBeInstanceOf(AccountDeletionInProgressError);
  });

  it('uses the concurrent winner when two requests create the same identity', async () => {
    const createdAt = NOW.toISOString();
    const identity = createAuthIdentityItem('KAKAO', SUBJECT, USER_ID, createdAt);
    const user = createAuthUserProfileItem(USER_ID, createdAt);
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        Object.assign(new Error('transaction conflict'), {
          name: 'TransactionCanceledException',
        })
      )
      .mockResolvedValueOnce({ Item: identity })
      .mockResolvedValueOnce({ Item: user });

    const result = await createRepository(send).findOrCreateUser('KAKAO', SUBJECT);

    expect(result).toMatchObject({ created: false, user: { userId: USER_ID } });
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('creates a session only with an active user check and stores a token hash', async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const result = await createRepository(send).createSession(USER_ID, 2_592_000);

    expect(result.refreshToken).toBe(
      createRefreshToken(SESSION_ID, CURRENT_SECRET)
    );
    const transaction = send.mock.calls[0]?.[0] as TransactWriteCommand;
    expect(transaction).toBeInstanceOf(TransactWriteCommand);
    expect(transaction.input.TransactItems?.[0]?.ConditionCheck).toMatchObject({
      ConditionExpression: 'entityType = :userEntityType AND #status = :active',
    });
    const storedSession = transaction.input.TransactItems?.[1]?.Put?.Item;
    expect(storedSession).toMatchObject({
      entityType: AUTH_ENTITY_TYPES.session,
      userId: USER_ID,
      sessionId: SESSION_ID,
      gsi1pk: `USER#${USER_ID}`,
      gsi1sk: `SESSION#${SESSION_ID}`,
      expiresAt: 1_788_652_800,
    });
    expect(storedSession?.refreshTokenHash).toBe(
      hashRefreshToken(result.refreshToken)
    );
    expect(JSON.stringify(storedSession)).not.toContain(CURRENT_SECRET);
  });

  it('rejects session creation when the active user condition fails', async () => {
    const send = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error('inactive account'), {
        name: 'TransactionCanceledException',
      })
    );

    await expect(
      createRepository(send).createSession(USER_ID, 2_592_000)
    ).rejects.toBeInstanceOf(AccountDeletionInProgressError);
  });

  it('rotates a refresh token with an atomic hash and expiry condition', async () => {
    const currentToken = createRefreshToken(SESSION_ID, CURRENT_SECRET);
    const nextToken = createRefreshToken(SESSION_ID, NEXT_SECRET);
    const currentItem = createAuthSessionItem({
      userId: USER_ID,
      sessionId: SESSION_ID,
      refreshTokenHash: hashRefreshToken(currentToken),
      now: NOW.toISOString(),
      expiresAt: 1_788_652_800,
    });
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Item: currentItem })
      .mockResolvedValueOnce({});

    const result = await createRepository(send, NEXT_SECRET).rotateRefreshToken(
      currentToken,
      2_592_000
    );

    expect(result.refreshToken).toBe(nextToken);
    const transaction = send.mock.calls[1]?.[0] as TransactWriteCommand;
    expect(transaction).toBeInstanceOf(TransactWriteCommand);
    const update = transaction.input.TransactItems?.[1]?.Update;
    expect(update?.ConditionExpression).toContain(
      'refreshTokenHash = :currentHash'
    );
    expect(update?.ConditionExpression).toContain('expiresAt > :nowEpoch');
    expect(update?.ExpressionAttributeValues).toMatchObject({
      ':currentHash': hashRefreshToken(currentToken),
      ':nextHash': hashRefreshToken(nextToken),
    });
    expect(
      transaction.input.TransactItems?.[0]?.ConditionCheck?.ConditionExpression
    ).toContain('#status = :active');
  });

  it('maps replay and malformed refresh credentials to a domain rejection', async () => {
    const currentToken = createRefreshToken(SESSION_ID, CURRENT_SECRET);
    const currentItem = createAuthSessionItem({
      userId: USER_ID,
      sessionId: SESSION_ID,
      refreshTokenHash: hashRefreshToken(currentToken),
      now: NOW.toISOString(),
      expiresAt: 1_788_652_800,
    });
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Item: currentItem })
      .mockRejectedValueOnce(
        Object.assign(new Error('conditional failure'), {
          name: 'TransactionCanceledException',
        })
      );
    const repository = createRepository(send, NEXT_SECRET);

    await expect(
      repository.rotateRefreshToken(
        currentToken,
        2_592_000
      )
    ).rejects.toBeInstanceOf(RefreshTokenRejectedError);
    await expect(
      repository.rotateRefreshToken('malformed', 2_592_000)
    ).rejects.toBeInstanceOf(RefreshTokenRejectedError);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('revokes the session only when the current refresh token matches', async () => {
    const currentToken = createRefreshToken(SESSION_ID, CURRENT_SECRET);
    const send = vi.fn().mockResolvedValueOnce({});

    await expect(
      createRepository(send).revokeSession(currentToken)
    ).resolves.toBe(true);

    const update = send.mock.calls[0]?.[0] as UpdateCommand;
    expect(update).toBeInstanceOf(UpdateCommand);
    expect(update.input.UpdateExpression).toContain('revokedAt = :now');
    expect(update.input.ConditionExpression).toContain(
      'refreshTokenHash = :refreshTokenHash'
    );
    expect(update.input.ExpressionAttributeValues).toMatchObject({
      ':refreshTokenHash': hashRefreshToken(currentToken),
      ':sessionEntityType': AUTH_ENTITY_TYPES.session,
    });
  });

  it('treats malformed, expired, and already revoked sessions as not revoked', async () => {
    const send = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error('conditional failure'), {
        name: 'ConditionalCheckFailedException',
      })
    );
    const repository = createRepository(send);

    await expect(repository.revokeSession('malformed')).resolves.toBe(false);
    await expect(
      repository.revokeSession(createRefreshToken(SESSION_ID, CURRENT_SECRET))
    ).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('queries the byUser index for a user session list', async () => {
    const item = createAuthSessionItem({
      userId: USER_ID,
      sessionId: SESSION_ID,
      refreshTokenHash: 'hash',
      now: NOW.toISOString(),
      expiresAt: 1_783_556_800,
    });
    const send = vi.fn().mockResolvedValueOnce({ Items: [item] });

    const sessions = await createRepository(send).listSessions(USER_ID);

    expect(sessions).toHaveLength(1);
    const query = send.mock.calls[0]?.[0] as QueryCommand;
    expect(query).toBeInstanceOf(QueryCommand);
    expect(query.input).toMatchObject({
      IndexName: 'byUser',
      KeyConditionExpression:
        'gsi1pk = :userKey AND begins_with(gsi1sk, :sessionPrefix)',
    });
  });
});
