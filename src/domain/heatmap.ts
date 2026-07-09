import type { HeatmapBucket, HeatmapDay, HeatmapGridCell, WorkoutSession } from '@/src/types';

import { addLocalDays, getRecentDateKeys, startOfLocalDay, toLocalDateKey } from './date';

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

/**
 * Builds a weekday-aligned grid (Sunday-first columns) covering the last
 * `days` days. Leading cells that fall outside the range are marked
 * `inRange: false` so the UI can render them as empty placeholders.
 */
export function buildHeatmapGrid(
  sessions: WorkoutSession[],
  days: number,
  now = new Date()
): HeatmapGridCell[] {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    if (session.status !== 'completed') {
      continue;
    }
    const dateKey = toLocalDateKey(session.startedAt);
    totals.set(dateKey, (totals.get(dateKey) ?? 0) + session.durationSeconds);
  }

  const today = startOfLocalDay(now);
  const rangeStart = addLocalDays(today, -(days - 1));
  const gridStart = addLocalDays(rangeStart, -rangeStart.getDay());

  const cells: HeatmapGridCell[] = [];
  for (let cursor = gridStart; cursor.getTime() <= today.getTime(); cursor = addLocalDays(cursor, 1)) {
    const dateKey = toLocalDateKey(cursor);
    const inRange = cursor.getTime() >= rangeStart.getTime();
    const durationSeconds = inRange ? totals.get(dateKey) ?? 0 : 0;
    cells.push({
      dateKey,
      durationSeconds,
      bucket: getHeatmapBucket(durationSeconds),
      inRange,
    });
  }
  return cells;
}
