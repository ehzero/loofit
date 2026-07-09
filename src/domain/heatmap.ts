import type { HeatmapBucket, HeatmapDay, WorkoutSession } from '@/src/types';

import { getRecentDateKeys, toLocalDateKey } from './date';

export function getHeatmapBucket(durationSeconds: number): HeatmapBucket {
  if (durationSeconds <= 0) {
    return 0;
  }
  if (durationSeconds < 30 * 60) {
    return 1;
  }
  if (durationSeconds < 60 * 60) {
    return 2;
  }
  if (durationSeconds < 90 * 60) {
    return 3;
  }
  return 4;
}

export function buildHeatmap(
  sessions: WorkoutSession[],
  days: number,
  now = new Date()
): HeatmapDay[] {
  const dateKeys = getRecentDateKeys(days, now);
  const totals = new Map(dateKeys.map((dateKey) => [dateKey, 0]));

  for (const session of sessions) {
    if (session.status !== 'completed') {
      continue;
    }
    const dateKey = toLocalDateKey(session.startedAt);
    if (!totals.has(dateKey)) {
      continue;
    }
    totals.set(dateKey, (totals.get(dateKey) ?? 0) + session.durationSeconds);
  }

  return dateKeys.map((dateKey) => {
    const durationSeconds = totals.get(dateKey) ?? 0;
    return {
      dateKey,
      durationSeconds,
      bucket: getHeatmapBucket(durationSeconds),
    };
  });
}
