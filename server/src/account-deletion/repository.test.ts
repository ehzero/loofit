import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';

import { AccountDeletionRepository } from './repository';

describe('account deletion repository', () => {
  it('deletes partition, identity, sessions, ranking, and profile last', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Item: {
          status: 'DELETING',
          deletionRequestId: 'request-1',
        },
      })
      .mockResolvedValueOnce({
        Items: [
          { pk: 'USER#user-1', sk: 'PROFILE' },
          { pk: 'USER#user-1', sk: 'BACKUP#WORKOUTS' },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Items: [
          { pk: 'IDENTITY#KAKAO#hash', sk: 'USER' },
          { pk: 'SESSION#session-1', sk: 'SESSION' },
        ],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Items: [{ period: 'weekly#2026-32', userId: 'user-1' }],
      })
      .mockResolvedValueOnce({});
    const repository = new AccountDeletionRepository({
      client: { send } as never,
      userDataTableName: 'user-data',
      userDataByUserIndexName: 'byUser',
      leaderboardTableName: 'leaderboard',
      leaderboardByUserIndexName: 'byUser',
    });

    await repository.purge('user-1', 'request-1');

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(QueryCommand);
    expect(send.mock.calls[2]?.[0]).toBeInstanceOf(BatchWriteCommand);
    expect(send.mock.calls[3]?.[0]).toBeInstanceOf(QueryCommand);
    expect(send.mock.calls[5]?.[0]).toBeInstanceOf(QueryCommand);
    const finalDelete = send.mock.calls[7]?.[0] as DeleteCommand;
    expect(finalDelete).toBeInstanceOf(DeleteCommand);
    expect(finalDelete.input.Key).toEqual({
      pk: 'USER#user-1',
      sk: 'PROFILE',
    });
    expect(finalDelete.input.ConditionExpression).toContain(
      'deletionRequestId = :requestId'
    );
  });

  it('is idempotent after the profile was already removed', async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const repository = new AccountDeletionRepository({
      client: { send } as never,
      userDataTableName: 'user-data',
      userDataByUserIndexName: 'byUser',
      leaderboardTableName: 'leaderboard',
      leaderboardByUserIndexName: 'byUser',
    });

    await expect(repository.purge('user-1', 'request-1')).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not delete anything when the request no longer owns the profile', async () => {
    const send = vi.fn().mockResolvedValueOnce({
      Item: {
        status: 'ACTIVE',
        deletionRequestId: 'another-request',
      },
    });
    const repository = new AccountDeletionRepository({
      client: { send } as never,
      userDataTableName: 'user-data',
      userDataByUserIndexName: 'byUser',
      leaderboardTableName: 'leaderboard',
      leaderboardByUserIndexName: 'byUser',
    });

    await expect(repository.purge('user-1', 'request-1')).rejects.toThrow(
      'does not own'
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
});
