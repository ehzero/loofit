import { describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  getLoofitAccessToken: vi.fn(),
}));

vi.mock('@/src/services/auth/native-auth', () => authMocks);

import { createWeeklyLeaderboardClient } from './weekly-leaderboard';

const payload = {
  period: {
    id: 'WEEK#2026-08-03',
    startsAt: '2026-08-02T15:00:00.000Z',
    endsAt: '2026-08-09T15:00:00.000Z',
    timeZone: 'Asia/Seoul',
  },
  policy: {
    minimumActiveDaySeconds: 300,
    maximumRankedDaySeconds: 7_200,
  },
  entries: [
    {
      rank: 1,
      displayName: '루핏 1A2B',
      activeDays: 3,
      workoutCount: 4,
      totalDurationSeconds: 7_200,
      isMe: true,
    },
  ],
  me: {
    rank: 1,
    displayName: '루핏 1A2B',
    activeDays: 3,
    workoutCount: 4,
    totalDurationSeconds: 7_200,
    isMe: true,
  },
  generatedAt: '2026-08-08T12:00:00.000Z',
};

describe('weekly leaderboard client', () => {
  it('fetches and validates the authenticated current week leaderboard', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const client = createWeeklyLeaderboardClient({
      apiBaseUrl: 'https://api.example.com/',
      getAccessToken: vi.fn().mockResolvedValue('access-token'),
      fetchImplementation,
    });

    await expect(client.getCurrentWeek()).resolves.toEqual(payload);
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/v1/leaderboards/weekly',
      expect.objectContaining({
        headers: { authorization: 'Bearer access-token' },
      })
    );
  });

  it('rejects malformed public ranking entries', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...payload,
          entries: [{ ...payload.entries[0], displayName: '' }],
        }),
        { status: 200 }
      )
    );
    const client = createWeeklyLeaderboardClient({
      apiBaseUrl: 'https://api.example.com',
      getAccessToken: vi.fn().mockResolvedValue('access-token'),
      fetchImplementation,
    });

    await expect(client.getCurrentWeek()).rejects.toThrow(
      'Weekly leaderboard entry was invalid.'
    );
  });
});
