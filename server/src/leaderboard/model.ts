import { createHash } from 'node:crypto';

import { WORKOUT_SYNC_ENTITY_TYPES } from '../workout-sync/model';

export const LEADERBOARD_TIME_ZONE = 'Asia/Seoul';
export const MINIMUM_ACTIVE_DAY_SECONDS = 5 * 60;
export const MAXIMUM_RANKED_DAY_SECONDS = 2 * 60 * 60;
export const LEADERBOARD_SCORE_DAY_MULTIPLIER = 100_000;
export const LEADERBOARD_RETENTION_DAYS = 90;

const KOREA_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;

export type WeeklyLeaderboardPeriod = {
  id: string;
  startsAt: string;
  endsAt: string;
  timeZone: typeof LEADERBOARD_TIME_ZONE;
};

export type WeeklyLeaderboardAggregate = {
  activeDays: number;
  workoutCount: number;
  totalDurationSeconds: number;
  score: number;
};

export type WeeklyLeaderboardItem = WeeklyLeaderboardAggregate & {
  period: string;
  userId: string;
  displayName: string;
  sourceRevision: number;
  updatedAt: string;
  expiresAt: number;
};

export type WeeklyLeaderboardMarker = Omit<WeeklyLeaderboardItem, 'score'> & {
  activeDays: 0;
  workoutCount: 0;
  totalDurationSeconds: 0;
};

type DailyAggregate = {
  workoutCount: number;
  totalDurationSeconds: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const koreaDateKey = (timestamp: number): string =>
  new Date(timestamp + KOREA_OFFSET_MILLISECONDS).toISOString().slice(0, 10);

export const getWeeklyLeaderboardPeriod = (
  now: Date
): WeeklyLeaderboardPeriod => {
  const shifted = new Date(now.getTime() + KOREA_OFFSET_MILLISECONDS);
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7;
  const mondayInKorea = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - daysSinceMonday
  );
  const startsAtMilliseconds = mondayInKorea - KOREA_OFFSET_MILLISECONDS;
  const endsAtMilliseconds = startsAtMilliseconds + 7 * DAY_MILLISECONDS;
  return {
    id: `WEEK#${new Date(mondayInKorea).toISOString().slice(0, 10)}`,
    startsAt: new Date(startsAtMilliseconds).toISOString(),
    endsAt: new Date(endsAtMilliseconds).toISOString(),
    timeZone: LEADERBOARD_TIME_ZONE,
  };
};

export const createWeeklyDisplayName = (
  userId: string,
  periodId: string
): string => {
  const suffix = createHash('sha256')
    .update(periodId)
    .update('\0')
    .update(userId)
    .digest('hex')
    .slice(0, 4)
    .toUpperCase();
  return `루핏 ${suffix}`;
};

export const calculateWeeklyLeaderboardAggregate = (
  items: readonly unknown[],
  period: WeeklyLeaderboardPeriod,
  now: Date
): WeeklyLeaderboardAggregate => {
  const startsAt = Date.parse(period.startsAt);
  const endsAt = Date.parse(period.endsAt);
  const nowMilliseconds = now.getTime();
  const days = new Map<string, DailyAggregate>();

  for (const item of items) {
    if (
      !isRecord(item) ||
      item.entityType !== WORKOUT_SYNC_ENTITY_TYPES.record ||
      !isRecord(item.record) ||
      item.record.status !== 'completed' ||
      typeof item.record.startedAt !== 'string' ||
      !Number.isSafeInteger(item.record.durationSeconds) ||
      typeof item.record.durationSeconds !== 'number' ||
      item.record.durationSeconds < 0
    ) {
      continue;
    }
    const startedAt = Date.parse(item.record.startedAt);
    if (
      !Number.isFinite(startedAt) ||
      startedAt < startsAt ||
      startedAt >= endsAt ||
      startedAt > nowMilliseconds
    ) {
      continue;
    }
    const dayKey = koreaDateKey(startedAt);
    const day = days.get(dayKey) ?? {
      workoutCount: 0,
      totalDurationSeconds: 0,
    };
    day.workoutCount += 1;
    day.totalDurationSeconds += item.record.durationSeconds;
    days.set(dayKey, day);
  }

  let activeDays = 0;
  let workoutCount = 0;
  let totalDurationSeconds = 0;
  for (const day of days.values()) {
    if (day.totalDurationSeconds < MINIMUM_ACTIVE_DAY_SECONDS) {
      continue;
    }
    activeDays += 1;
    workoutCount += day.workoutCount;
    totalDurationSeconds += Math.min(
      day.totalDurationSeconds,
      MAXIMUM_RANKED_DAY_SECONDS
    );
  }

  return {
    activeDays,
    workoutCount,
    totalDurationSeconds,
    score:
      activeDays * LEADERBOARD_SCORE_DAY_MULTIPLIER + totalDurationSeconds,
  };
};

export const createWeeklyLeaderboardItem = ({
  userId,
  sourceRevision,
  items,
  now,
}: {
  userId: string;
  sourceRevision: number;
  items: readonly unknown[];
  now: Date;
}): WeeklyLeaderboardItem | null => {
  const period = getWeeklyLeaderboardPeriod(now);
  const aggregate = calculateWeeklyLeaderboardAggregate(items, period, now);
  if (aggregate.activeDays === 0) {
    return null;
  }
  return {
    period: period.id,
    userId,
    displayName: createWeeklyDisplayName(userId, period.id),
    sourceRevision,
    ...aggregate,
    updatedAt: now.toISOString(),
    expiresAt:
      Math.floor(Date.parse(period.endsAt) / 1_000) +
      LEADERBOARD_RETENTION_DAYS * 24 * 60 * 60,
  };
};

export const createWeeklyLeaderboardMarker = ({
  userId,
  sourceRevision,
  now,
}: {
  userId: string;
  sourceRevision: number;
  now: Date;
}): WeeklyLeaderboardMarker => {
  const period = getWeeklyLeaderboardPeriod(now);
  return {
    period: period.id,
    userId,
    displayName: createWeeklyDisplayName(userId, period.id),
    sourceRevision,
    activeDays: 0,
    workoutCount: 0,
    totalDurationSeconds: 0,
    updatedAt: now.toISOString(),
    expiresAt:
      Math.floor(Date.parse(period.endsAt) / 1_000) +
      LEADERBOARD_RETENTION_DAYS * 24 * 60 * 60,
  };
};
