import { describe, expect, it } from 'vitest';

import type { WorkoutSession } from '@/src/types';

import { buildHeatmap, getHeatmapBucket } from './heatmap';

describe('heatmap policy', () => {
  it('maps duration to MVP buckets', () => {
    expect(getHeatmapBucket(0)).toBe(0);
    expect(getHeatmapBucket(29 * 60)).toBe(1);
    expect(getHeatmapBucket(30 * 60)).toBe(2);
    expect(getHeatmapBucket(60 * 60)).toBe(3);
    expect(getHeatmapBucket(90 * 60)).toBe(4);
  });

  it('sums only completed sessions by started date', () => {
    const days = buildHeatmap(
      [
        makeSession('completed', '2026-07-08T20:30:00', 1800),
        makeSession('completed', '2026-07-08T12:00:00', 1200),
        makeSession('canceled', '2026-07-08T13:00:00', 9999),
      ],
      2,
      new Date('2026-07-09T10:00:00')
    );

    expect(days.some((day) => day.durationSeconds === 3000)).toBe(true);
    expect(days.every((day) => day.durationSeconds !== 12999)).toBe(true);
  });
});

function makeSession(
  status: WorkoutSession['status'],
  startedAt: string,
  durationSeconds: number
): WorkoutSession {
  return {
    id: Math.random(),
    routineId: null,
    routineDayId: null,
    routineDayNameSnapshot: null,
    startedAt,
    endedAt: startedAt,
    durationSeconds,
    status,
    note: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    parts: [],
  };
}
