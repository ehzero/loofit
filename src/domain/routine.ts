import type { RoutineDay, RoutineProgress } from '@/src/types';

export function getNextRoutineDay(
  routineDays: RoutineDay[],
  progress: RoutineProgress | null
): RoutineDay | null {
  if (routineDays.length === 0) {
    return null;
  }

  const sorted = [...routineDays].sort((a, b) => a.sortOrder - b.sortOrder);

  if (progress?.nextRoutineDayId) {
    return sorted.find((day) => day.id === progress.nextRoutineDayId) ?? sorted[0];
  }

  return sorted[0];
}

export function getRoutineDayAfterCompletion(
  routineDays: RoutineDay[],
  completedRoutineDayId: number
): RoutineDay | null {
  if (routineDays.length === 0) {
    return null;
  }

  const sorted = [...routineDays].sort((a, b) => a.sortOrder - b.sortOrder);
  const completedIndex = sorted.findIndex((day) => day.id === completedRoutineDayId);
  if (completedIndex < 0) {
    return sorted[0];
  }

  return sorted[(completedIndex + 1) % sorted.length];
}

export function joinPartNames(parts: Array<{ name: string }>): string {
  if (parts.length === 0) {
    return '운동 기록';
  }
  return parts.map((part) => part.name).join(' · ');
}

/** Historical session titles must not follow later routine alias edits. */
export function workoutSessionDisplayName(session: {
  routineDayNameSnapshot: string | null;
  parts: Array<{ bodyPartName: string }>;
}): string {
  const frozenName = session.routineDayNameSnapshot?.trim();
  if (frozenName) {
    return frozenName;
  }
  return joinPartNames(session.parts.map((part) => ({ name: part.bodyPartName })));
}

type RoutineDayLike = { name: string; parts: Array<{ name: string }> };

/**
 * A routine day's name is an optional alias (e.g. "Push"). When absent, the
 * display name is derived from its parts so the UI never shows the same
 * information twice (alias + part chips only render together when the alias
 * adds meaning beyond the part list).
 */
export function hasRoutineDayAlias(day: RoutineDayLike): boolean {
  return day.name.trim().length > 0;
}

export function routineDayDisplayName(day: RoutineDayLike): string {
  const alias = day.name.trim();
  if (alias) {
    return alias;
  }
  if (day.parts.length > 0) {
    return day.parts.map((part) => part.name).join(' · ');
  }
  return '새 분할';
}
