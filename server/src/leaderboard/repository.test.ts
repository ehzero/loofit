import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';

import { AUTH_ENTITY_TYPES } from '../auth/model';
import { WORKOUT_SYNC_ENTITY_TYPES } from '../workout-sync/model';

import { createWeeklyLeaderboardItem } from './model';
import { LeaderboardRepository } from './repository';

const NOW = new Date('2026-08-08T12:00:00.000Z');
const USER_ID = 'user-1';

const repository = (send: ReturnType<typeof vi.fn>) =>
  new LeaderboardRepository({
    client: { send } as never,
    userDataTableName: 'user-data',
    leaderboardTableName: 'leaderboard',
    leaderboardScoreIndexName: 'byScore',
    now: () => NOW,
  });

const activeProfile = {
  entityType: AUTH_ENTITY_TYPES.userProfile,
  status: 'ACTIVE',
};

const state = {
  entityType: WORKOUT_SYNC_ENTITY_TYPES.state,
  backupRevision: 4,
};

const workoutItem = {
  entityType: WORKOUT_SYNC_ENTITY_TYPES.record,
  record: {
    status: 'completed',
    startedAt: '2026-08-04T01:00:00.000Z',
    durationSeconds: 1_800,
  },
};

describe('leaderboard repository', () => {
  it('recomputes and writes the current weekly item from a stable backup revision', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Item: activeProfile })
      .mockResolvedValueOnce({ Item: state })
      .mockResolvedValueOnce({ Items: [workoutItem] })
      .mockResolvedValueOnce({ Item: state })
      .mockResolvedValueOnce({});

    await repository(send).refreshCurrentWeek(USER_ID);

    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(GetCommand);
    expect(send.mock.calls[2]?.[0]).toBeInstanceOf(QueryCommand);
    const transaction = send.mock.calls[4]?.[0] as TransactWriteCommand;
    expect(transaction).toBeInstanceOf(TransactWriteCommand);
    expect(transaction.input.TransactItems?.[0]?.ConditionCheck).toMatchObject({
      TableName: 'user-data',
      ConditionExpression:
        'entityType = :userEntityType AND #status = :active',
    });
    expect(transaction.input.TransactItems?.[1]?.Put?.Item).toMatchObject({
      period: 'WEEK#2026-08-03',
      userId: USER_ID,
      sourceRevision: 4,
      activeDays: 1,
      workoutCount: 1,
      totalDurationSeconds: 1_800,
      score: 101_800,
    });
  });

  it('returns shared ranks and resolves the current user outside the top list', async () => {
    const first = createWeeklyLeaderboardItem({
      userId: 'first',
      sourceRevision: 1,
      items: [workoutItem],
      now: NOW,
    })!;
    const tied = { ...first, userId: 'second', displayName: '루핏 AAAA' };
    const toScoreIndexProjection = ({
      activeDays: _activeDays,
      sourceRevision: _sourceRevision,
      expiresAt: _expiresAt,
      ...item
    }: typeof first) => item;
    const me = {
      ...first,
      userId: USER_ID,
      displayName: '루핏 BBBB',
      score: 100_900,
      totalDurationSeconds: 900,
    };
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Item: activeProfile })
      .mockResolvedValueOnce({
        Items: [
          toScoreIndexProjection(first),
          toScoreIndexProjection(tied),
        ],
      })
      .mockResolvedValueOnce({ Item: me })
      .mockResolvedValueOnce({ Count: 2 });

    const result = await repository(send).getCurrentWeek(USER_ID);

    expect(result.entries.map((entry) => entry.rank)).toEqual([1, 1]);
    expect(result.me).toMatchObject({ rank: 3, isMe: true });
    const countQuery = send.mock.calls[3]?.[0] as QueryCommand;
    expect(countQuery.input.Select).toBe('COUNT');
  });
});
