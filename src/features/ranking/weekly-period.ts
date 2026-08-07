import type { WeeklyLeaderboard } from '@/src/services/ranking/weekly-leaderboard';

const KOREA_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;

type WeeklyLeaderboardPeriod = WeeklyLeaderboard['period'];

export const getCurrentWeeklyLeaderboardPeriod = (
  now = new Date()
): WeeklyLeaderboardPeriod => {
  const shifted = new Date(now.getTime() + KOREA_OFFSET_MILLISECONDS);
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7;
  const mondayInKorea = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - daysSinceMonday
  );
  const startsAtMilliseconds = mondayInKorea - KOREA_OFFSET_MILLISECONDS;
  return {
    id: `WEEK#${new Date(mondayInKorea).toISOString().slice(0, 10)}`,
    startsAt: new Date(startsAtMilliseconds).toISOString(),
    endsAt: new Date(startsAtMilliseconds + 7 * DAY_MILLISECONDS).toISOString(),
    timeZone: 'Asia/Seoul',
  };
};

export const formatWeeklyLeaderboardPeriod = (
  period: WeeklyLeaderboardPeriod
): string => {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    timeZone: period.timeZone,
  });
  const startsAt = formatter.format(new Date(period.startsAt));
  const endsAt = formatter.format(new Date(Date.parse(period.endsAt) - 1));
  return `${startsAt} ~ ${endsAt}`;
};
