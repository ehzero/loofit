import type { DynamoDBStreamEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';

import { createLeaderboardWorker } from './leaderboard-worker';

describe('leaderboard DynamoDB stream worker', () => {
  it('deduplicates workout backup revision events and ignores unrelated items', async () => {
    const refreshCurrentWeek = vi.fn().mockResolvedValue(undefined);
    const event = {
      Records: [
        {
          dynamodb: {
            Keys: {
              pk: { S: 'USER#user-1' },
              sk: { S: 'BACKUP#WORKOUTS' },
            },
          },
        },
        {
          dynamodb: {
            Keys: {
              pk: { S: 'USER#user-1' },
              sk: { S: 'BACKUP#WORKOUTS' },
            },
          },
        },
        {
          dynamodb: {
            Keys: {
              pk: { S: 'SESSION#session-1' },
              sk: { S: 'SESSION' },
            },
          },
        },
      ],
    } as DynamoDBStreamEvent;

    await createLeaderboardWorker({ refreshCurrentWeek })(
      event,
      {} as never,
      vi.fn()
    );

    expect(refreshCurrentWeek).toHaveBeenCalledTimes(1);
    expect(refreshCurrentWeek).toHaveBeenCalledWith('user-1');
  });
});
