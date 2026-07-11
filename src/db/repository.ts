import type * as SQLite from 'expo-sqlite';

import { buildHeatmap, buildHeatmapGrid } from '@/src/domain/heatmap';
import { addLocalDays, getWeekStart, startOfLocalDay, toLocalDateKey } from '@/src/domain/date';
import {
  getNextRoutineDay,
  getRoutineDayAfterCompletion,
  routineDayDisplayName,
} from '@/src/domain/routine';
import type {
  AppOverview,
  BodyPart,
  DashboardStats,
  RangeStats,
  Routine,
  RoutineDay,
  RoutineProgress,
  RoutineTemplate,
  SessionStatus,
  StartWorkoutInput,
  WorkoutSession,
  WorkoutSessionPartSnapshot,
} from '@/src/types';

import {
  getDatabase,
  resetDatabaseForDevelopment,
  withDatabaseReadTransaction,
} from './database';
import { DEFAULT_BODY_PARTS } from './schema';
import { ROUTINE_TEMPLATES } from './templates';

type BodyPartRow = {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
};

type RoutineRow = {
  id: number;
  name: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type RoutineDayRow = {
  id: number;
  routine_id: number;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  id: number;
  routine_id: number | null;
  routine_day_id: number | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  status: SessionStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type SessionPartRow = {
  id: number;
  workout_session_id: number;
  body_part_id: number | null;
  body_part_name: string;
  body_part_color: string;
  sort_order: number;
};

type RoutineProgressRow = {
  active_routine_id: number | null;
  next_routine_day_id: number | null;
  updated_at: string;
};

type GetSessionsOptions = {
  statuses?: SessionStatus[];
  sessionId?: number;
  limit?: number;
  /** ISO timestamp; only sessions started at or after this instant. */
  sinceStartedAt?: string;
};

export type RepositoryWorkoutResult = {
  status: 'applied' | 'noop' | 'stale' | 'rejected';
  session: WorkoutSession | null;
};

function mapBodyPart(row: BodyPartRow): BodyPart {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRoutine(row: RoutineRow): Routine {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRoutineDay(row: RoutineDayRow, parts: BodyPart[]): RoutineDay {
  return {
    id: row.id,
    routineId: row.routine_id,
    name: row.name,
    sortOrder: row.sort_order,
    parts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSessionPart(row: SessionPartRow): WorkoutSessionPartSnapshot {
  return {
    id: row.id,
    workoutSessionId: row.workout_session_id,
    bodyPartId: row.body_part_id,
    bodyPartName: row.body_part_name,
    bodyPartColor: row.body_part_color,
    sortOrder: row.sort_order,
  };
}

function mapSession(row: SessionRow, parts: WorkoutSessionPartSnapshot[]): WorkoutSession {
  return {
    id: row.id,
    routineId: row.routine_id,
    routineDayId: row.routine_day_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    parts,
  };
}

async function getBodyPartsFromDatabase(
  db: SQLite.SQLiteDatabase,
  includeArchived = false
): Promise<BodyPart[]> {
  const rows = await db.getAllAsync<BodyPartRow>(
    `SELECT * FROM body_parts
     ${includeArchived ? '' : 'WHERE is_archived = 0'}
     ORDER BY sort_order ASC, id ASC`
  );
  return rows.map(mapBodyPart);
}

export async function getBodyParts(includeArchived = false): Promise<BodyPart[]> {
  return getBodyPartsFromDatabase(await getDatabase(), includeArchived);
}

async function getActiveRoutineFromDatabase(
  db: SQLite.SQLiteDatabase
): Promise<Routine | null> {
  const row = await db.getFirstAsync<RoutineRow>(
    `SELECT * FROM routines WHERE is_active = 1 ORDER BY id DESC LIMIT 1`
  );
  return row ? mapRoutine(row) : null;
}

export async function getActiveRoutine(): Promise<Routine | null> {
  return getActiveRoutineFromDatabase(await getDatabase());
}

async function getRoutineDaysFromDatabase(
  db: SQLite.SQLiteDatabase,
  routineId: number | null | undefined
): Promise<RoutineDay[]> {
  if (!routineId) {
    return [];
  }

  const rows = await db.getAllAsync<RoutineDayRow>(
    `SELECT * FROM routine_days WHERE routine_id = ? ORDER BY sort_order ASC, id ASC`,
    routineId
  );
  const partRows = await db.getAllAsync<
    BodyPartRow & { routine_day_id: number; part_sort_order: number }
  >(
    `SELECT bp.*, rdp.routine_day_id, rdp.sort_order AS part_sort_order
     FROM routine_day_parts rdp
     JOIN body_parts bp ON bp.id = rdp.body_part_id
     WHERE rdp.routine_day_id IN (${rows.map(() => '?').join(',') || 'NULL'})
       AND bp.is_archived = 0
     ORDER BY rdp.routine_day_id ASC, rdp.sort_order ASC`,
    rows.map((row) => row.id)
  );

  return rows.map((row) =>
    mapRoutineDay(
      row,
      partRows
        .filter((part) => part.routine_day_id === row.id)
        .map((part) => mapBodyPart({ ...part, sort_order: part.part_sort_order }))
    )
  );
}

export async function getRoutineDays(routineId: number | null | undefined): Promise<RoutineDay[]> {
  return getRoutineDaysFromDatabase(await getDatabase(), routineId);
}

async function getRoutineProgressFromDatabase(
  db: SQLite.SQLiteDatabase
): Promise<RoutineProgress | null> {
  const row = await db.getFirstAsync<RoutineProgressRow>(
    `SELECT active_routine_id, next_routine_day_id, updated_at FROM routine_progress WHERE id = 1`
  );
  return row
    ? {
        activeRoutineId: row.active_routine_id,
        nextRoutineDayId: row.next_routine_day_id,
        updatedAt: row.updated_at,
      }
    : null;
}

export async function getRoutineProgress(): Promise<RoutineProgress | null> {
  return getRoutineProgressFromDatabase(await getDatabase());
}

async function upsertRoutineProgress(
  db: SQLite.SQLiteDatabase,
  activeRoutineId: number | null,
  nextRoutineDayId: number | null
): Promise<void> {
  await db.runAsync(
    `INSERT INTO routine_progress (id, active_routine_id, next_routine_day_id, updated_at)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       active_routine_id = excluded.active_routine_id,
       next_routine_day_id = excluded.next_routine_day_id,
       updated_at = excluded.updated_at`,
    activeRoutineId,
    nextRoutineDayId,
    new Date().toISOString()
  );
}

export async function setNextRoutineDay(routineDayId: number | null): Promise<boolean> {
  const db = await getDatabase();
  const routine = await getActiveRoutineFromDatabase(db);
  await upsertRoutineProgress(db, routine?.id ?? null, routineDayId);
  return true;
}

export async function getAppSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = ? LIMIT 1`,
    key
  );
  return row?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    value,
    new Date().toISOString()
  );
}

export async function createEmptyRoutine(): Promise<boolean> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(`UPDATE routines SET is_active = 0, updated_at = ?`, now);
    const routineResult = await tx.runAsync(
      `INSERT INTO routines (name, is_active, created_at, updated_at) VALUES (?, 1, ?, ?)`,
      '내 루틴',
      now,
      now
    );
    const routineId = routineResult.lastInsertRowId;
    const dayResult = await tx.runAsync(
      `INSERT INTO routine_days (routine_id, name, sort_order, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?)`,
      routineId,
      '',
      now,
      now
    );
    await tx.runAsync(
      `INSERT INTO routine_progress (id, active_routine_id, next_routine_day_id, updated_at)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         active_routine_id = excluded.active_routine_id,
         next_routine_day_id = excluded.next_routine_day_id,
         updated_at = excluded.updated_at`,
      routineId,
      dayResult.lastInsertRowId,
      now
    );
  });
  return true;
}

export async function createRoutineFromTemplate(template: RoutineTemplate): Promise<boolean> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const config = ROUTINE_TEMPLATES[template];

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(`UPDATE routines SET is_active = 0, updated_at = ?`, now);
    const routineResult = await tx.runAsync(
      `INSERT INTO routines (name, is_active, created_at, updated_at) VALUES (?, 1, ?, ?)`,
      config.name,
      now,
      now
    );
    const routineId = routineResult.lastInsertRowId;
    let firstRoutineDayId: number | null = null;

    for (const [dayIndex, day] of config.days.entries()) {
      const dayResult = await tx.runAsync(
        `INSERT INTO routine_days (routine_id, name, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        routineId,
        day.name,
        dayIndex,
        now,
        now
      );
      const routineDayId = dayResult.lastInsertRowId;
      firstRoutineDayId ??= routineDayId;

      for (const [partIndex, partName] of day.parts.entries()) {
        const part = await tx.getFirstAsync<BodyPartRow>(
          `SELECT * FROM body_parts WHERE name = ? LIMIT 1`,
          partName
        );
        if (!part) {
          continue;
        }
        await tx.runAsync(
          `INSERT INTO routine_day_parts (routine_day_id, body_part_id, sort_order)
           VALUES (?, ?, ?)`,
          routineDayId,
          part.id,
          partIndex
        );
      }
    }

    await tx.runAsync(
      `INSERT INTO routine_progress (id, active_routine_id, next_routine_day_id, updated_at)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         active_routine_id = excluded.active_routine_id,
         next_routine_day_id = excluded.next_routine_day_id,
         updated_at = excluded.updated_at`,
      routineId,
      firstRoutineDayId,
      now
    );
  });
  return true;
}

export async function addBodyPart(name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }

  const db = await getDatabase();
  const now = new Date().toISOString();
  const count = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM body_parts`);
  const colors = DEFAULT_BODY_PARTS.map((part) => part.color);
  const color = colors[(count?.count ?? 0) % colors.length];

  await db.runAsync(
    `INSERT INTO body_parts (name, color, sort_order, is_archived, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)
     ON CONFLICT(name) DO UPDATE SET is_archived = 0, updated_at = excluded.updated_at`,
    trimmed,
    color,
    count?.count ?? 0,
    now,
    now
  );
  return true;
}

export async function archiveBodyPart(id: number): Promise<boolean> {
  const db = await getDatabase();
  let archived = false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const result = await tx.runAsync(
      `UPDATE body_parts SET is_archived = 1, updated_at = ? WHERE id = ?`,
      new Date().toISOString(),
      id
    );
    archived = result.changes > 0;
    if (!archived) {
      return;
    }
    // Archiving means "stop offering this part", so drop it from routine days
    // too. Past session snapshots keep their own copies and are unaffected.
    await tx.runAsync(`DELETE FROM routine_day_parts WHERE body_part_id = ?`, id);
  });
  return archived;
}

export async function addRoutineDay(name: string, bodyPartIds: number[]): Promise<boolean> {
  const trimmed = name.trim();
  const routine = await getActiveRoutine();
  if (!routine || !trimmed || bodyPartIds.length === 0) {
    return false;
  }

  const db = await getDatabase();
  const now = new Date().toISOString();
  const nextOrder = await db.getFirstAsync<{ next_order: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM routine_days WHERE routine_id = ?`,
    routine.id
  );

  await db.withExclusiveTransactionAsync(async (tx) => {
    const result = await tx.runAsync(
      `INSERT INTO routine_days (routine_id, name, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      routine.id,
      trimmed,
      nextOrder?.next_order ?? 0,
      now,
      now
    );

    for (const [index, bodyPartId] of bodyPartIds.entries()) {
      await tx.runAsync(
        `INSERT INTO routine_day_parts (routine_day_id, body_part_id, sort_order)
         VALUES (?, ?, ?)`,
        result.lastInsertRowId,
        bodyPartId,
        index
      );
    }
  });
  return true;
}

export async function addEmptyRoutineDay(name: string): Promise<boolean> {
  const routine = await getActiveRoutine();
  if (!routine) {
    return false;
  }
  const db = await getDatabase();
  const now = new Date().toISOString();
  const nextOrder = await db.getFirstAsync<{ next_order: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM routine_days WHERE routine_id = ?`,
    routine.id
  );
  await db.runAsync(
    `INSERT INTO routine_days (routine_id, name, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    routine.id,
    name.trim(),
    nextOrder?.next_order ?? 0,
    now,
    now
  );
  return true;
}

export async function renameRoutineDay(dayId: number, name: string): Promise<boolean> {
  // The name is an optional alias; an empty string clears it and the UI
  // falls back to displaying the day's part list.
  const db = await getDatabase();
  const result = await db.runAsync(
    `UPDATE routine_days SET name = ?, updated_at = ? WHERE id = ?`,
    name.trim(),
    new Date().toISOString(),
    dayId
  );
  return result.changes > 0;
}

export async function setRoutineDayParts(
  dayId: number,
  bodyPartIds: number[]
): Promise<boolean> {
  const db = await getDatabase();
  let updated = false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const existing = await tx.getFirstAsync<{ id: number }>(
      `SELECT id FROM routine_days WHERE id = ? LIMIT 1`,
      dayId
    );
    if (!existing) {
      return;
    }

    await tx.runAsync(`DELETE FROM routine_day_parts WHERE routine_day_id = ?`, dayId);
    for (const [index, bodyPartId] of bodyPartIds.entries()) {
      await tx.runAsync(
        `INSERT INTO routine_day_parts (routine_day_id, body_part_id, sort_order)
         VALUES (?, ?, ?)`,
        dayId,
        bodyPartId,
        index
      );
    }
    const result = await tx.runAsync(
      `UPDATE routine_days SET updated_at = ? WHERE id = ?`,
      new Date().toISOString(),
      dayId
    );
    updated = result.changes > 0;
  });
  return updated;
}

/** Swaps a routine day with its neighbor in the given direction (-1 up, +1 down). */
export async function moveRoutineDay(dayId: number, direction: -1 | 1): Promise<boolean> {
  if (direction !== -1 && direction !== 1) {
    return false;
  }
  const routine = await getActiveRoutine();
  const days = await getRoutineDays(routine?.id);
  const index = days.findIndex((day) => day.id === dayId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= days.length) {
    return false;
  }

  const current = days[index];
  const neighbor = days[targetIndex];
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `UPDATE routine_days SET sort_order = ?, updated_at = ? WHERE id = ?`,
      neighbor.sortOrder,
      now,
      current.id
    );
    await tx.runAsync(
      `UPDATE routine_days SET sort_order = ?, updated_at = ? WHERE id = ?`,
      current.sortOrder,
      now,
      neighbor.id
    );
  });
  return true;
}

export async function deleteRoutineDay(dayId: number): Promise<boolean> {
  const db = await getDatabase();
  let deleted = false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const result = await tx.runAsync(`DELETE FROM routine_days WHERE id = ?`, dayId);
    deleted = result.changes > 0;
    if (!deleted) {
      return;
    }

    await tx.runAsync(`DELETE FROM routine_day_parts WHERE routine_day_id = ?`, dayId);
    const progress = await tx.getFirstAsync<{ next_routine_day_id: number | null }>(
      `SELECT next_routine_day_id FROM routine_progress WHERE id = 1`
    );
    if (progress?.next_routine_day_id === dayId) {
      const fallback = await tx.getFirstAsync<{ id: number }>(
        `SELECT id FROM routine_days ORDER BY sort_order ASC, id ASC LIMIT 1`
      );
      await tx.runAsync(
        `UPDATE routine_progress SET next_routine_day_id = ?, updated_at = ? WHERE id = 1`,
        fallback?.id ?? null,
        new Date().toISOString()
      );
    }
  });
  return deleted;
}

async function getRoutineDayByIdFromDatabase(
  db: SQLite.SQLiteDatabase,
  id: number
): Promise<RoutineDay | null> {
  const activeRoutine = await getActiveRoutineFromDatabase(db);
  const routineDays = await getRoutineDaysFromDatabase(db, activeRoutine?.id);
  return routineDays.find((day) => day.id === id) ?? null;
}

async function getRoutineDayById(id: number): Promise<RoutineDay | null> {
  return getRoutineDayByIdFromDatabase(await getDatabase(), id);
}

async function getActiveSessionFromDatabase(
  db: SQLite.SQLiteDatabase
): Promise<WorkoutSession | null> {
  const sessions = await getSessionsFromDatabase(db, {
    statuses: ['active'],
    limit: 1,
  });
  return sessions[0] ?? null;
}

async function getActiveSession(): Promise<WorkoutSession | null> {
  return getActiveSessionFromDatabase(await getDatabase());
}

async function insertSessionParts(
  db: SQLite.SQLiteDatabase,
  sessionId: number,
  parts: Array<{ id: number | null; name: string; color: string }>
): Promise<void> {
  for (const [index, part] of parts.entries()) {
    await db.runAsync(
      `INSERT INTO workout_session_parts_snapshot
       (workout_session_id, body_part_id, body_part_name, body_part_color, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      sessionId,
      part.id,
      part.name,
      part.color,
      index
    );
  }
}

export async function startWorkout(input: StartWorkoutInput): Promise<RepositoryWorkoutResult> {
  const db = await getDatabase();
  const outcome: { value?: RepositoryWorkoutResult } = {};

  await db.withExclusiveTransactionAsync(async (tx) => {
    const transaction = tx as unknown as SQLite.SQLiteDatabase;
    const existing = await getActiveSessionFromDatabase(transaction);
    if (existing) {
      outcome.value = { status: 'noop', session: existing };
      return;
    }

    const now = new Date().toISOString();
    let routineId: number | null = null;
    let routineDayId: number | null = null;
    let parts: Array<{ id: number | null; name: string; color: string }> = [];

    if (input.kind === 'routine') {
      const routineDay = await getRoutineDayByIdFromDatabase(transaction, input.routineDayId);
      if (!routineDay) {
        outcome.value = { status: 'rejected', session: null };
        return;
      }
      routineId = routineDay.routineId;
      routineDayId = routineDay.id;
      parts = routineDay.parts;
    } else {
      const allParts = await getBodyPartsFromDatabase(transaction, false);
      parts = allParts.filter((part) => input.bodyPartIds.includes(part.id));
      const label = input.label?.trim();
      if (parts.length === 0 && label) {
        parts = [{ id: null, name: label, color: '#6C757D' }];
      }
    }

    if (parts.length === 0) {
      outcome.value = { status: 'rejected', session: null };
      return;
    }

    const insert = await transaction.runAsync(
      `INSERT INTO workout_sessions
       (routine_id, routine_day_id, started_at, ended_at, duration_seconds, status, note, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 0, 'active', NULL, ?, ?)`,
      routineId,
      routineDayId,
      now,
      now,
      now
    );
    await insertSessionParts(transaction, insert.lastInsertRowId, parts);
    outcome.value = {
      status: 'applied',
      session: await getSessionByIdFromDatabase(transaction, insert.lastInsertRowId),
    };
  });

  return workoutTransactionOutcome(outcome);
}

export async function changeActiveWorkout(
  expectedSessionId: number,
  input: StartWorkoutInput
): Promise<RepositoryWorkoutResult> {
  const db = await getDatabase();
  const outcome: { value?: RepositoryWorkoutResult } = {};

  await db.withExclusiveTransactionAsync(async (tx) => {
    const transaction = tx as unknown as SQLite.SQLiteDatabase;
    const active = await getActiveSessionFromDatabase(transaction);
    if (!active) {
      outcome.value = { status: 'stale', session: null };
      return;
    }
    if (active.id !== expectedSessionId) {
      outcome.value = { status: 'stale', session: active };
      return;
    }

    let routineId: number | null = null;
    let routineDayId: number | null = null;
    let parts: Array<{ id: number | null; name: string; color: string }> = [];

    if (input.kind === 'routine') {
      const routineDay = await getRoutineDayByIdFromDatabase(transaction, input.routineDayId);
      if (!routineDay) {
        outcome.value = { status: 'rejected', session: active };
        return;
      }
      routineId = routineDay.routineId;
      routineDayId = routineDay.id;
      parts = routineDay.parts;
    } else {
      const allParts = await getBodyPartsFromDatabase(transaction, false);
      parts = allParts.filter((part) => input.bodyPartIds.includes(part.id));
    }

    if (parts.length === 0) {
      outcome.value = { status: 'rejected', session: active };
      return;
    }

    const updated = await transaction.runAsync(
      `UPDATE workout_sessions
       SET routine_id = ?, routine_day_id = ?, updated_at = ?
       WHERE id = ? AND status = 'active'`,
      routineId,
      routineDayId,
      new Date().toISOString(),
      active.id
    );
    if (updated.changes !== 1) {
      outcome.value = { status: 'stale', session: active };
      return;
    }
    await transaction.runAsync(
      `DELETE FROM workout_session_parts_snapshot WHERE workout_session_id = ?`,
      active.id
    );
    await insertSessionParts(transaction, active.id, parts);
    outcome.value = {
      status: 'applied',
      session: await getSessionByIdFromDatabase(transaction, active.id),
    };
  });

  return workoutTransactionOutcome(outcome);
}

export async function completeActiveWorkout(
  expectedSessionId: number
): Promise<RepositoryWorkoutResult> {
  return finishActiveWorkout(expectedSessionId, 'completed');
}

export async function cancelActiveWorkout(
  expectedSessionId: number
): Promise<RepositoryWorkoutResult> {
  return finishActiveWorkout(expectedSessionId, 'canceled');
}

async function finishActiveWorkout(
  expectedSessionId: number,
  status: Extract<SessionStatus, 'completed' | 'canceled'>
): Promise<RepositoryWorkoutResult> {
  const db = await getDatabase();
  const outcome: { value?: RepositoryWorkoutResult } = {};

  await db.withExclusiveTransactionAsync(async (tx) => {
    const transaction = tx as unknown as SQLite.SQLiteDatabase;
    const active = await getActiveSessionFromDatabase(transaction);
    if (!active) {
      const prior = await transaction.getFirstAsync<Pick<SessionRow, 'status'>>(
        `SELECT status FROM workout_sessions WHERE id = ? LIMIT 1`,
        expectedSessionId
      );
      outcome.value = {
        status:
          prior?.status === 'completed' || prior?.status === 'canceled' ? 'noop' : 'stale',
        session: null,
      };
      return;
    }
    if (active.id !== expectedSessionId) {
      outcome.value = { status: 'stale', session: active };
      return;
    }

    const now = new Date();
    const durationSeconds = Math.max(
      0,
      Math.floor((now.getTime() - new Date(active.startedAt).getTime()) / 1000)
    );
    const nowIso = now.toISOString();
    const updated = await transaction.runAsync(
      `UPDATE workout_sessions
       SET status = ?, ended_at = ?, duration_seconds = ?, updated_at = ?
       WHERE id = ? AND status = 'active'`,
      status,
      nowIso,
      durationSeconds,
      nowIso,
      active.id
    );
    if (updated.changes !== 1) {
      outcome.value = { status: 'stale', session: active };
      return;
    }

    if (status === 'completed' && active.routineDayId) {
      const routine = await getActiveRoutineFromDatabase(transaction);
      const routineDays = await getRoutineDaysFromDatabase(transaction, routine?.id);
      const nextDay = getRoutineDayAfterCompletion(routineDays, active.routineDayId);
      await upsertRoutineProgress(transaction, routine?.id ?? null, nextDay?.id ?? null);
    }

    outcome.value = {
      status: 'applied',
      session: await getSessionByIdFromDatabase(transaction, active.id),
    };
  });

  return workoutTransactionOutcome(outcome);
}

function workoutTransactionOutcome(outcome: {
  value?: RepositoryWorkoutResult;
}): RepositoryWorkoutResult {
  if (!outcome.value) {
    throw new Error('Workout transaction completed without a result.');
  }
  return outcome.value;
}

export async function updateSession(
  id: number,
  updates: {
    status?: SessionStatus;
    startedAt?: string;
    endedAt?: string | null;
    note?: string | null;
    routineDayId?: number | null;
    bodyPartIds?: number[];
  }
): Promise<boolean> {
  const current = await getSessionById(id);
  if (!current) {
    return false;
  }

  // Only one active session may exist at a time — the home screen and widgets
  // assume a single source of truth for the workout-in-progress state.
  if (updates.status === 'active' && current.status !== 'active') {
    const existingActive = await getActiveSession();
    if (existingActive && existingActive.id !== id) {
      throw new Error('이미 진행 중인 운동이 있어 진행 중으로 바꿀 수 없어요.');
    }
  }

  const db = await getDatabase();
  const startedAt = updates.startedAt ?? current.startedAt;
  const endedAt = updates.endedAt === undefined ? current.endedAt : updates.endedAt;
  const durationSeconds =
    endedAt && updates.status !== 'active'
      ? Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000))
      : 0;
  const status = updates.status ?? current.status;
  const now = new Date().toISOString();
  let updated = false;

  await db.withExclusiveTransactionAsync(async (tx) => {
    let routineId = current.routineId;
    let routineDayId = current.routineDayId;
    let parts: BodyPart[] | null = null;

    if (updates.routineDayId !== undefined) {
      if (updates.routineDayId === null) {
        routineId = null;
        routineDayId = null;
        if (updates.bodyPartIds) {
          const allParts = await getBodyParts(false);
          parts = allParts.filter((part) => updates.bodyPartIds?.includes(part.id));
        }
      } else {
        const routineDay = await getRoutineDayById(updates.routineDayId);
        if (routineDay) {
          routineId = routineDay.routineId;
          routineDayId = routineDay.id;
          parts = routineDay.parts;
        }
      }
    }

    const result = await tx.runAsync(
      `UPDATE workout_sessions
       SET status = ?, routine_id = ?, routine_day_id = ?, started_at = ?, ended_at = ?,
           duration_seconds = ?, note = ?, updated_at = ?
       WHERE id = ?`,
      status,
      routineId,
      routineDayId,
      startedAt,
      endedAt,
      durationSeconds,
      updates.note === undefined ? current.note : updates.note,
      now,
      id
    );
    updated = result.changes > 0;

    if (updated && parts) {
      await tx.runAsync(`DELETE FROM workout_session_parts_snapshot WHERE workout_session_id = ?`, id);
      await insertSessionParts(tx as unknown as SQLite.SQLiteDatabase, id, parts);
    }
  });
  return updated;
}

export async function deleteSession(id: number): Promise<boolean> {
  const db = await getDatabase();
  let deleted = false;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const result = await tx.runAsync(`DELETE FROM workout_sessions WHERE id = ?`, id);
    deleted = result.changes > 0;
    if (deleted) {
      await tx.runAsync(
        `DELETE FROM workout_session_parts_snapshot WHERE workout_session_id = ?`,
        id
      );
    }
  });
  return deleted;
}

export async function getSessionById(id: number): Promise<WorkoutSession | null> {
  return getSessionByIdFromDatabase(await getDatabase(), id);
}

async function getSessionByIdFromDatabase(
  db: SQLite.SQLiteDatabase,
  id: number
): Promise<WorkoutSession | null> {
  const sessions = await getSessionsFromDatabase(db, {
    sessionId: id,
    limit: 1,
  });
  return sessions[0] ?? null;
}

async function getSessionsFromDatabase(
  db: SQLite.SQLiteDatabase,
  options?: GetSessionsOptions
): Promise<WorkoutSession[]> {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (options?.sessionId) {
    clauses.push('id = ?');
    params.push(options.sessionId);
  }

  if (options?.statuses?.length) {
    clauses.push(`status IN (${options.statuses.map(() => '?').join(',')})`);
    params.push(...options.statuses);
  }

  if (options?.sinceStartedAt) {
    clauses.push('started_at >= ?');
    params.push(options.sinceStartedAt);
  }

  const rows = await db.getAllAsync<SessionRow>(
    `SELECT * FROM workout_sessions
     ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY started_at DESC, id DESC
     ${options?.limit ? `LIMIT ${options.limit}` : ''}`,
    params
  );

  if (rows.length === 0) {
    return [];
  }

  const partRows = await db.getAllAsync<SessionPartRow>(
    `SELECT * FROM workout_session_parts_snapshot
     WHERE workout_session_id IN (${rows.map(() => '?').join(',')})
     ORDER BY workout_session_id ASC, sort_order ASC`,
    rows.map((row) => row.id)
  );

  return rows.map((row) =>
    mapSession(
      row,
      partRows.filter((part) => part.workout_session_id === row.id).map(mapSessionPart)
    )
  );
}

export async function getSessions(options?: GetSessionsOptions): Promise<WorkoutSession[]> {
  return getSessionsFromDatabase(await getDatabase(), options);
}

/** Completed-session count, total duration, and split totals since the given instant. */
async function getCompletedRangeStats(
  db: SQLite.SQLiteDatabase,
  sinceIso: string,
  routineDays: RoutineDay[]
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
            MAX(rd.name) AS routine_day_name,
            COUNT(*) AS count,
            SUM(ws.duration_seconds) AS total
     FROM workout_sessions ws
     LEFT JOIN routine_days rd ON rd.id = ws.routine_day_id
     WHERE ws.status = 'completed' AND ws.started_at >= ?
     GROUP BY ws.routine_day_id
     HAVING total > 0
     ORDER BY total DESC`,
    sinceIso
  );

  return {
    workoutCount: row?.count ?? 0,
    durationSeconds: Math.round(row?.total ?? 0),
    bySplit: splitRows.map((split) => ({
      name: splitDisplayName(split.routine_day_id, split.routine_day_name, routineDays),
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

function splitDisplayName(
  routineDayId: number | null,
  routineDayName: string | null,
  routineDays: RoutineDay[]
): string {
  if (!routineDayId) {
    return '자유 운동';
  }

  const routineDay = routineDays.find((day) => day.id === routineDayId);
  if (routineDay) {
    return routineDayDisplayName(routineDay);
  }

  const fallback = routineDayName?.trim();
  return fallback || '삭제된 분할';
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
        addLocalDays(today, -6).toISOString(),
        routineDays
      ),
      last30: await getCompletedRangeStats(
        db,
        addLocalDays(today, -29).toISOString(),
        routineDays
      ),
      last6Months: await getCompletedRangeStats(
        db,
        sixMonthRangeStart.toISOString(),
        routineDays
      ),
      last365: await getCompletedRangeStats(
        db,
        addLocalDays(today, -364).toISOString(),
        routineDays
      ),
    },
  };
}

export async function getOverview(now = new Date()): Promise<AppOverview> {
  return withDatabaseReadTransaction((db) => buildOverviewFromDatabase(db, now));
}

export async function resetAllData(): Promise<boolean> {
  await resetDatabaseForDevelopment();
  return true;
}
