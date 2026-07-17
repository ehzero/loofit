import type * as SQLite from 'expo-sqlite';

import { addLocalDays, getWeekStart, startOfLocalDay, toLocalDateKey } from '@/src/domain/date';
import { buildHeatmap, buildHeatmapGrid } from '@/src/domain/heatmap';
import { getNextRoutineDay } from '@/src/domain/routine';
import type { AppOverview, DashboardStats, RangeStats } from '@/src/types';

import { withDatabaseReadTransaction } from '../database';
import { getBodyPartsFromDatabase } from '../repositories/body-part-repository';
import {
  getActiveRoutineFromDatabase,
  getRoutineDaysFromDatabase,
  getRoutineProgressFromDatabase,
} from '../repositories/routine-repository';
import { getSessionsFromDatabase } from '../repositories/session-repository';

/** Completed-session count, total duration, and split totals since the given instant. */
async function getCompletedRangeStats(
  db: SQLite.SQLiteDatabase,
  sinceIso: string
): Promise<RangeStats> {
  const row = await db.getFirstAsync<{ count: number; total: number | null }>(
    `SELECT COUNT(*) AS count, SUM(duration_seconds) AS total
     FROM workout_sessions
     WHERE status = 'completed' AND started_at >= ?`,
    sinceIso
  );
  const splitRows = await db.getAllAsync<{
    routine_day_id: number | null;
    routine_day_name: string | null;
    count: number;
    total: number;
  }>(
    `SELECT ws.routine_day_id,
            ws.routine_day_name_snapshot AS routine_day_name,
            COUNT(*) AS count,
            SUM(ws.duration_seconds) AS total
     FROM workout_sessions ws
     WHERE ws.status = 'completed' AND ws.started_at >= ?
     GROUP BY ws.routine_day_id, ws.routine_day_name_snapshot
     HAVING total > 0
     ORDER BY total DESC`,
    sinceIso
  );

  return {
    workoutCount: row?.count ?? 0,
    durationSeconds: Math.round(row?.total ?? 0),
    bySplit: splitRows.map((split) => ({
      name: splitDisplayName(split.routine_day_name),
      workoutCount: split.count,
      durationSeconds: Math.round(split.total),
    })),
  };
}

/**
 * All-time dashboard stats computed with SQL aggregates so they stay exact
 * regardless of how many sessions exist (the overview's session list is
 * capped for recency, which must not cap the totals).
 */
async function getDashboardStats(
  db: SQLite.SQLiteDatabase,
  now: Date
): Promise<DashboardStats> {
  const weekStart = getWeekStart(now);
  const weekEnd = addLocalDays(weekStart, 7);

  const weekRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM workout_sessions
     WHERE status = 'completed' AND started_at >= ? AND started_at < ?`,
    weekStart.toISOString(),
    weekEnd.toISOString()
  );
  const totalRow = await db.getFirstAsync<{ total: number | null }>(
    `SELECT SUM(duration_seconds) AS total FROM workout_sessions WHERE status = 'completed'`
  );

  return {
    weekWorkoutCount: weekRow?.count ?? 0,
    totalDurationSeconds: Math.round(totalRow?.total ?? 0),
  };
}

function splitDisplayName(routineDayName: string | null): string {
  const frozenName = routineDayName?.trim();
  if (frozenName) {
    return frozenName;
  }
  return '삭제된 분할';
}

async function buildOverviewFromDatabase(
  db: SQLite.SQLiteDatabase,
  now: Date
): Promise<AppOverview> {
  const bodyParts = await getBodyPartsFromDatabase(db, false);
  const activeRoutine = await getActiveRoutineFromDatabase(db);
  const routineDays = await getRoutineDaysFromDatabase(db, activeRoutine?.id);
  const progress = await getRoutineProgressFromDatabase(db);
  const sessions = await getSessionsFromDatabase(db, { limit: 50 });
  // Query the active session directly: it may have started long ago (sessions
  // are never auto-closed) and must be found regardless of the recency cap.
  const activeSession =
    (await getSessionsFromDatabase(db, { statuses: ['active'], limit: 1 }))[0] ?? null;
  const todayKey = toLocalDateKey(now);
  const todaySessions = sessions.filter(
    (session) =>
      session.status === 'completed' && toLocalDateKey(session.startedAt) === todayKey
  );
  const latestCompletedToday = todaySessions[0] ?? null;

  // One date-bounded query covers every heatmap range (the year view is the
  // superset); a count cap would silently truncate long histories.
  const today = startOfLocalDay(now);
  const sixMonthRangeStart = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const heatmapSessions = await getSessionsFromDatabase(db, {
    statuses: ['completed'],
    sinceStartedAt: addLocalDays(today, -364).toISOString(),
  });

  return {
    bodyParts,
    activeRoutine,
    routineDays,
    progress,
    nextRoutineDay: getNextRoutineDay(routineDays, progress),
    activeSession,
    latestCompletedToday,
    todaySessions,
    recentSessions: sessions.slice(0, 12),
    heatmap7: buildHeatmap(heatmapSessions, 7, now),
    heatmap30: buildHeatmap(heatmapSessions, 30, now),
    heatmapGrid: buildHeatmapGrid(heatmapSessions, 30, now),
    heatmapYear: buildHeatmapGrid(heatmapSessions, 365, now),
    dashboard: await getDashboardStats(db, now),
    rangeStats: {
      last7: await getCompletedRangeStats(
        db,
        addLocalDays(today, -6).toISOString()
      ),
      last30: await getCompletedRangeStats(
        db,
        addLocalDays(today, -29).toISOString()
      ),
      last6Months: await getCompletedRangeStats(
        db,
        sixMonthRangeStart.toISOString()
      ),
      last365: await getCompletedRangeStats(
        db,
        addLocalDays(today, -364).toISOString()
      ),
    },
  };
}

export async function getOverview(now = new Date()): Promise<AppOverview> {
  return withDatabaseReadTransaction((db) => buildOverviewFromDatabase(db, now));
}
