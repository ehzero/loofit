import { addLocalDays, startOfLocalDay, toLocalDateKey } from '@/src/domain/date';
import type { HeatmapDay, HeatmapGridCell } from '@/src/types';

export type CurrentMonthHeatmapCell = HeatmapGridCell & {
  isGap?: boolean;
  isToday?: boolean;
};

export type CurrentMonthHeatmapModel = {
  title: string;
  cells: CurrentMonthHeatmapCell[];
};

export function buildCurrentMonthHeatmapModel(
  source: ReadonlyMap<string, HeatmapDay>,
  now = new Date()
): CurrentMonthHeatmapModel {
  const today = startOfLocalDay(now);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const gridStart = addLocalDays(monthStart, -monthStart.getDay());
  const gridEnd = addLocalDays(monthEnd, 6 - monthEnd.getDay());
  const cells: CurrentMonthHeatmapCell[] = [];

  for (
    let cursor = gridStart;
    cursor.getTime() <= gridEnd.getTime();
    cursor = addLocalDays(cursor, 1)
  ) {
    const inMonth =
      cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth();
    if (!inMonth) {
      cells.push({ dateKey: '', durationSeconds: 0, bucket: 0, inRange: false, isGap: true });
      continue;
    }

    const dateKey = toLocalDateKey(cursor);
    const sourceCell = cursor.getTime() <= today.getTime() ? source.get(dateKey) : undefined;
    cells.push({
      dateKey,
      durationSeconds: sourceCell?.durationSeconds ?? 0,
      bucket: sourceCell?.bucket ?? 0,
      inRange: true,
      ...(cursor.getTime() === today.getTime() ? { isToday: true } : {}),
    });
  }

  return {
    title: `${today.getMonth() + 1}월`,
    cells,
  };
}
