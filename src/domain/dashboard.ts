import type { BodyPart, DashboardStats, WorkoutSession } from '@/src/types';

import { getWeekStart } from './date';

export function buildDashboardStats(
  sessions: WorkoutSession[],
  bodyParts: BodyPart[],
  now = new Date()
): DashboardStats {
  const completed = sessions.filter((session) => session.status === 'completed');
  const weekStart = getWeekStart(now).getTime();
  const nextWeekStart = weekStart + 7 * 24 * 60 * 60 * 1000;
  const weekWorkoutCount = completed.filter((session) => {
    const started = new Date(session.startedAt).getTime();
    return started >= weekStart && started < nextWeekStart;
  }).length;
  const totalDurationSeconds = completed.reduce(
    (total, session) => total + session.durationSeconds,
    0
  );

  const bodyPartMap = new Map(
    bodyParts.map((part) => [
      part.name,
      {
        name: part.name,
        color: part.color,
        durationSeconds: 0,
      },
    ])
  );

  for (const session of completed) {
    if (session.parts.length === 0) {
      continue;
    }

    const share = session.durationSeconds / session.parts.length;
    for (const part of session.parts) {
      const current =
        bodyPartMap.get(part.bodyPartName) ??
        {
          name: part.bodyPartName,
          color: part.bodyPartColor,
          durationSeconds: 0,
        };
      current.durationSeconds += share;
      bodyPartMap.set(part.bodyPartName, current);
    }
  }

  return {
    weekWorkoutCount,
    totalDurationSeconds,
    byBodyPart: [...bodyPartMap.values()]
      .filter((part) => part.durationSeconds > 0)
      .sort((a, b) => b.durationSeconds - a.durationSeconds),
  };
}
