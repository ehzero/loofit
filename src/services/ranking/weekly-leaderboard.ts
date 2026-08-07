import authConfig from '@/src/config/auth.json';
import { getLoofitAccessToken } from '@/src/services/auth/native-auth';

export type WeeklyLeaderboardEntry = {
  rank: number;
  displayName: string;
  activeDays: number;
  workoutCount: number;
  totalDurationSeconds: number;
  isMe: boolean;
};

export type WeeklyLeaderboard = {
  period: {
    id: string;
    startsAt: string;
    endsAt: string;
    timeZone: 'Asia/Seoul';
  };
  policy: {
    minimumActiveDaySeconds: number;
    maximumRankedDaySeconds: number;
  };
  entries: WeeklyLeaderboardEntry[];
  me: WeeklyLeaderboardEntry | null;
  generatedAt: string;
};

export class WeeklyLeaderboardApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'WeeklyLeaderboardApiError';
    this.status = status;
  }
}

type WeeklyLeaderboardClientOptions = {
  apiBaseUrl: string;
  getAccessToken: () => Promise<string>;
  fetchImplementation?: typeof fetch;
};

const REQUEST_TIMEOUT_MS = 15_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

const parseEntry = (value: unknown): WeeklyLeaderboardEntry => {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.rank) ||
    typeof value.rank !== 'number' ||
    value.rank <= 0 ||
    typeof value.displayName !== 'string' ||
    value.displayName.length === 0 ||
    value.displayName.length > 50 ||
    !Number.isSafeInteger(value.activeDays) ||
    typeof value.activeDays !== 'number' ||
    value.activeDays < 1 ||
    value.activeDays > 7 ||
    !Number.isSafeInteger(value.workoutCount) ||
    typeof value.workoutCount !== 'number' ||
    value.workoutCount <= 0 ||
    !Number.isSafeInteger(value.totalDurationSeconds) ||
    typeof value.totalDurationSeconds !== 'number' ||
    value.totalDurationSeconds < 0 ||
    typeof value.isMe !== 'boolean'
  ) {
    throw new WeeklyLeaderboardApiError('Weekly leaderboard entry was invalid.');
  }
  return {
    rank: value.rank,
    displayName: value.displayName,
    activeDays: value.activeDays,
    workoutCount: value.workoutCount,
    totalDurationSeconds: value.totalDurationSeconds,
    isMe: value.isMe,
  };
};

const parseWeeklyLeaderboard = (value: unknown): WeeklyLeaderboard => {
  if (
    !isRecord(value) ||
    !isRecord(value.period) ||
    typeof value.period.id !== 'string' ||
    !/^WEEK#\d{4}-\d{2}-\d{2}$/.test(value.period.id) ||
    !validTimestamp(value.period.startsAt) ||
    !validTimestamp(value.period.endsAt) ||
    value.period.timeZone !== 'Asia/Seoul' ||
    !isRecord(value.policy) ||
    !Number.isSafeInteger(value.policy.minimumActiveDaySeconds) ||
    typeof value.policy.minimumActiveDaySeconds !== 'number' ||
    value.policy.minimumActiveDaySeconds <= 0 ||
    !Number.isSafeInteger(value.policy.maximumRankedDaySeconds) ||
    typeof value.policy.maximumRankedDaySeconds !== 'number' ||
    value.policy.maximumRankedDaySeconds <= 0 ||
    !Array.isArray(value.entries) ||
    value.entries.length > 50 ||
    !validTimestamp(value.generatedAt)
  ) {
    throw new WeeklyLeaderboardApiError('Weekly leaderboard response was invalid.');
  }
  const entries = value.entries.map(parseEntry);
  return {
    period: {
      id: value.period.id,
      startsAt: value.period.startsAt,
      endsAt: value.period.endsAt,
      timeZone: value.period.timeZone,
    },
    policy: {
      minimumActiveDaySeconds: value.policy.minimumActiveDaySeconds,
      maximumRankedDaySeconds: value.policy.maximumRankedDaySeconds,
    },
    entries,
    me: value.me === null ? null : parseEntry(value.me),
    generatedAt: value.generatedAt,
  };
};

export const createWeeklyLeaderboardClient = (
  options: WeeklyLeaderboardClientOptions
) => ({
  async getCurrentWeek(): Promise<WeeklyLeaderboard> {
    const accessToken = await options.getAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await (options.fetchImplementation ?? fetch)(
        `${options.apiBaseUrl.replace(/\/$/, '')}/v1/leaderboards/weekly`,
        {
          headers: { authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        }
      );
    } catch {
      throw new WeeklyLeaderboardApiError('Weekly leaderboard request failed.');
    } finally {
      clearTimeout(timeout);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new WeeklyLeaderboardApiError(
        'Weekly leaderboard response was invalid.',
        response.status
      );
    }
    if (!response.ok) {
      throw new WeeklyLeaderboardApiError(
        `Weekly leaderboard API failed with ${response.status}.`,
        response.status
      );
    }
    return parseWeeklyLeaderboard(body);
  },
});

const weeklyLeaderboardClient = createWeeklyLeaderboardClient({
  apiBaseUrl: authConfig.apiBaseUrl,
  getAccessToken: getLoofitAccessToken,
});

export const getCurrentWeeklyLeaderboard = () =>
  weeklyLeaderboardClient.getCurrentWeek();
