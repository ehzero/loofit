import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';

import { LeaderboardAccountInactiveError } from '../leaderboard/repository';

import { createLeaderboardHandler } from './leaderboard';

const eventWithSubject = (
  subject: unknown
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    requestContext: {
      authorizer: { jwt: { claims: { sub: subject }, scopes: [] } },
    },
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

describe('GET /v1/leaderboards/weekly', () => {
  it('returns the authenticated user weekly leaderboard', async () => {
    const payload = {
      period: {
        id: 'WEEK#2026-08-03',
        startsAt: '2026-08-02T15:00:00.000Z',
        endsAt: '2026-08-09T15:00:00.000Z',
        timeZone: 'Asia/Seoul' as const,
      },
      policy: {
        minimumActiveDaySeconds: 300,
        maximumRankedDaySeconds: 7_200,
      },
      entries: [],
      me: null,
      generatedAt: '2026-08-08T12:00:00.000Z',
    };
    const getCurrentWeek = vi.fn().mockResolvedValue(payload);
    const ensureCurrentWeek = vi.fn().mockResolvedValue(undefined);
    const response = await createLeaderboardHandler({
      ensureCurrentWeek,
      getCurrentWeek,
    })(
      eventWithSubject('user-1'),
      'request-id'
    );
    expect(getCurrentWeek).toHaveBeenCalledWith('user-1');
    expect(ensureCurrentWeek).toHaveBeenCalledWith('user-1');
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body!)).toEqual(payload);
  });

  it('rejects missing subjects and inactive accounts', async () => {
    const missing = await createLeaderboardHandler({
      ensureCurrentWeek: vi.fn(),
      getCurrentWeek: vi.fn(),
    })(eventWithSubject(undefined), 'request-id');
    expect(missing.statusCode).toBe(401);

    const inactive = await createLeaderboardHandler({
      ensureCurrentWeek: vi
        .fn()
        .mockRejectedValue(new LeaderboardAccountInactiveError()),
      getCurrentWeek: vi
        .fn(),
    })(eventWithSubject('user-1'), 'request-id');
    expect(inactive.statusCode).toBe(401);
  });
});
