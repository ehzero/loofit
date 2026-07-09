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
    return '자유 운동';
  }
  return parts.map((part) => part.name).join(' + ');
}
