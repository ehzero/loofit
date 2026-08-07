import { describe, expect, it } from 'vitest';

import {
  formatWeeklyLeaderboardPeriod,
  getCurrentWeeklyLeaderboardPeriod,
} from './weekly-period';

describe('weekly ranking period', () => {
  it('calculates the current Monday-to-Sunday period in Korea time', () => {
    expect(
      getCurrentWeeklyLeaderboardPeriod(new Date('2026-08-08T03:00:00.000Z'))
    ).toEqual({
      id: 'WEEK#2026-08-03',
      startsAt: '2026-08-02T15:00:00.000Z',
      endsAt: '2026-08-09T15:00:00.000Z',
      timeZone: 'Asia/Seoul',
    });
  });

  it('moves to the next period at Monday midnight in Korea', () => {
    expect(
      getCurrentWeeklyLeaderboardPeriod(new Date('2026-08-09T15:00:00.000Z')).id
    ).toBe('WEEK#2026-08-10');
  });

  it('formats the period without waiting for a leaderboard response', () => {
    expect(
      formatWeeklyLeaderboardPeriod(
        getCurrentWeeklyLeaderboardPeriod(new Date('2026-08-08T03:00:00.000Z'))
      )
    ).toBe('8월 3일 ~ 8월 9일');
  });
});
