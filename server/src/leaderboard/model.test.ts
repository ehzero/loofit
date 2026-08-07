import { describe, expect, it } from 'vitest';

import { WORKOUT_SYNC_ENTITY_TYPES } from '../workout-sync/model';

import {
  calculateWeeklyLeaderboardAggregate,
  createWeeklyDisplayName,
  createWeeklyLeaderboardItem,
  getWeeklyLeaderboardPeriod,
} from './model';

const workout = (
  startedAt: string,
  durationSeconds: number,
  status: 'completed' | 'canceled' = 'completed'
) => ({
  entityType: WORKOUT_SYNC_ENTITY_TYPES.record,
  record: { status, startedAt, durationSeconds },
});

describe('weekly leaderboard model', () => {
  it('uses a Monday-to-Monday period in Korea Standard Time', () => {
    expect(
      getWeeklyLeaderboardPeriod(new Date('2026-08-08T03:00:00.000Z'))
    ).toEqual({
      id: 'WEEK#2026-08-03',
      startsAt: '2026-08-02T15:00:00.000Z',
      endsAt: '2026-08-09T15:00:00.000Z',
      timeZone: 'Asia/Seoul',
    });
  });

  it('ranks active days first and caps credited duration at two hours per day', () => {
    const now = new Date('2026-08-08T12:00:00.000Z');
    const period = getWeeklyLeaderboardPeriod(now);
    expect(
      calculateWeeklyLeaderboardAggregate(
        [
          workout('2026-08-03T01:00:00.000Z', 180),
          workout('2026-08-03T02:00:00.000Z', 180),
          workout('2026-08-04T01:00:00.000Z', 10_000),
          workout('2026-08-05T01:00:00.000Z', 3_600, 'canceled'),
          workout('2026-08-10T01:00:00.000Z', 3_600),
        ],
        period,
        now
      )
    ).toEqual({
      activeDays: 2,
      workoutCount: 3,
      totalDurationSeconds: 7_560,
      score: 207_560,
    });
  });

  it('does not publish a row until a day reaches five completed minutes', () => {
    expect(
      createWeeklyLeaderboardItem({
        userId: 'user-1',
        sourceRevision: 3,
        items: [workout('2026-08-03T01:00:00.000Z', 299)],
        now: new Date('2026-08-08T12:00:00.000Z'),
      })
    ).toBeNull();
  });

  it('creates a stable but period-specific anonymous display name', () => {
    const current = createWeeklyDisplayName('user-1', 'WEEK#2026-08-03');
    expect(current).toMatch(/^루핏 [0-9A-F]{4}$/);
    expect(current).toBe(
      createWeeklyDisplayName('user-1', 'WEEK#2026-08-03')
    );
    expect(current).not.toBe(
      createWeeklyDisplayName('user-1', 'WEEK#2026-08-10')
    );
  });
});
