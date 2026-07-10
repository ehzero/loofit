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

import { getDatabase, resetDatabaseForDevelopment } from './database';
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

export async function getBodyParts(includeArchived = false): Promise<BodyPart[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<BodyPartRow>(
    `SELECT * FROM body_parts
     ${includeArchived ? '' : 'WHERE is_archived = 0'}
     ORDER BY sort_order ASC, id ASC`
  );
  return rows.map(mapBodyPart);
}

export async function getActiveRoutine(): Promise<Routine | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<RoutineRow>(
    `SELECT * FROM routines WHERE is_active = 1 ORDER BY id DESC LIMIT 1`
  );
  return row ? mapRoutine(row) : null;
}

export async function getRoutineDays(routineId: number | null | undefined): Promise<RoutineDay[]> {
  if (!routineId) {
    return [];
  }

  const db = await getDatabase();
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

export async function getRoutineProgress(): Promise<RoutineProgress | null> {
  const db = await getDatabase();
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

export async function setNextRoutineDay(routineDayId: number | null): Promise<void> {
  const db = await getDatabase();
  const routine = await getActiveRoutine();
  await upsertRoutineProgress(db, routine?.id ?? null, routineDayId);
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

export async function createEmptyRoutine(): Promise<void> {
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
}

export async function createRoutineFromTemplate(template: RoutineTemplate): Promise<void> {
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
}

export async function addBodyPart(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    return;
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
}

export async function archiveBodyPart(id: number): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `UPDATE body_parts SET is_archived = 1, updated_at = ? WHERE id = ?`,
      new Date().toISOString(),
      id
    );
    // Archiving means "stop offering this part", so drop it from routine days
    // too. Past session snapshots keep their own copies and are unaffected.
    await tx.runAsync(`DELETE FROM routine_day_parts WHERE body_part_id = ?`, id);
  });
}

export async function addRoutineDay(name: string, bodyPartIds: number[]): Promise<void> {
  const trimmed = name.trim();
  const routine = await getActiveRoutine();
  if (!routine || !trimmed || bodyPartIds.length === 0) {
    return;
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
}

export async function addEmptyRoutineDay(name: string): Promise<void> {
  const routine = await getActiveRoutine();
  if (!routine) {
    return;
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
}

export async function renameRoutineDay(dayId: number, name: string): Promise<void> {
  // The name is an optional alias; an empty string clears it and the UI
  // falls back to displaying the day's part list.
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE routine_days SET name = ?, updated_at = ? WHERE id = ?`,
    name.trim(),
    new Date().toISOString(),
    dayId
  );
}

export async function setRoutineDayParts(dayId: number, bodyPartIds: number[]): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
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
    await tx.runAsync(
      `UPDATE routine_days SET updated_at = ? WHERE id = ?`,
      new Date().toISOString(),
      dayId
    );
  });
}

/** Swaps a routine day with its neighbor in the given direction (-1 up, +1 down). */
export async function moveRoutineDay(dayId: number, direction: -1 | 1): Promise<void> {
  const routine = await getActiveRoutine();
  const days = await getRoutineDays(routine?.id);
  const index = days.findIndex((day) => day.id === dayId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= days.length) {
    return;
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
}

export async function deleteRoutineDay(dayId: number): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(`DELETE FROM routine_day_parts WHERE routine_day_id = ?`, dayId);
    await tx.runAsync(`DELETE FROM routine_days WHERE id = ?`, dayId);
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
}

async function getRoutineDayById(id: number): Promise<RoutineDay | null> {
  const activeRoutine = await getActiveRoutine();
  const routineDays = await getRoutineDays(activeRoutine?.id);
  return routineDays.find((day) => day.id === id) ?? null;
}

async function getActiveSession(): Promise<WorkoutSession | null> {
  const sessions = await getSessions({
    statuses: ['active'],
    limit: 1,
  });
  return sessions[0] ?? null;
}

async function insertSessionParts(
  db: SQLite.SQLiteDatabase,
  sessionId: number,
  parts: Array<Pick<BodyPart, 'id' | 'name' | 'color'>>
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

export async function startWorkout(input: StartWorkoutInput): Promise<WorkoutSession | null> {
  const existing = await getActiveSession();
  if (existing) {
    return existing;
  }

  const db = await getDatabase();
  const now = new Date().toISOString();
  let routineId: number | null = null;
  let routineDayId: number | null = null;
  let parts: BodyPart[] = [];

  if (input.kind === 'routine') {
    const routineDay = await getRoutineDayById(input.routineDayId);
    if (!routineDay) {
      return null;
    }
    routineId = routineDay.routineId;
    routineDayId = routineDay.id;
    parts = routineDay.parts;
  } else {
    const allParts = await getBodyParts(false);
    parts = allParts.filter((part) => input.bodyPartIds.includes(part.id));
    if (parts.length === 0 && input.label) {
      parts = [
        {
          id: -1,
          name: input.label,
          color: '#6C757D',
          sortOrder: 0,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        },
      ];
    }
  }

  if (parts.length === 0) {
    return null;
  }

  let sessionId = 0;
  await db.withExclusiveTransactionAsync(async (tx) => {
    const result = await tx.runAsync(
      `INSERT INTO workout_sessions
       (routine_id, routine_day_id, started_at, ended_at, duration_seconds, status, note, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 0, 'active', NULL, ?, ?)`,
      routineId,
      routineDayId,
      now,
      now,
      now
    );
    sessionId = result.lastInsertRowId;
    await insertSessionParts(tx as unknown as SQLite.SQLiteDatabase, sessionId, parts);
  });

  return getSessionById(sessionId);
}

export async function changeActiveWorkout(input: StartWorkoutInput): Promise<WorkoutSession | null> {
  const active = await getActiveSession();
  if (!active) {
    return null;
  }

  const db = await getDatabase();
  const now = new Date().toISOString();
  let routineId: number | null = null;
  let routineDayId: number | null = null;
  let parts: BodyPart[] = [];

  if (input.kind === 'routine') {
    const routineDay = await getRoutineDayById(input.routineDayId);
    if (!routineDay) {
      return active;
    }
    routineId = routineDay.routineId;
    routineDayId = routineDay.id;
    parts = routineDay.parts;
  } else {
    const allParts = await getBodyParts(false);
    parts = allParts.filter((part) => input.bodyPartIds.includes(part.id));
  }

  if (parts.length === 0) {
    return active;
  }

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `UPDATE workout_sessions
       SET routine_id = ?, routine_day_id = ?, updated_at = ?
       WHERE id = ? AND status = 'active'`,
      routineId,
      routineDayId,
      now,
      active.id
    );
    await tx.runAsync(`DELETE FROM workout_session_parts_snapshot WHERE workout_session_id = ?`, active.id);
    await insertSessionParts(tx as unknown as SQLite.SQLiteDatabase, active.id, parts);
  });

  return getSessionById(active.id);
}

export async function completeActiveWorkout(): Promise<WorkoutSession | null> {
  const active = await getActiveSession();
  if (!active) {
    return null;
  }

  const db = await getDatabase();
  const now = new Date();
  const durationSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(active.startedAt).getTime()) / 1000)
  );

  await db.runAsync(
    `UPDATE workout_sessions
     SET status = 'completed', ended_at = ?, duration_seconds = ?, updated_at = ?
     WHERE id = ?`,
    now.toISOString(),
    durationSeconds,
    now.toISOString(),
    active.id
  );

  if (active.routineDayId) {
    const routine = await getActiveRoutine();
    const routineDays = await getRoutineDays(routine?.id);
    const nextDay = getRoutineDayAfterCompletion(routineDays, active.routineDayId);
    await upsertRoutineProgress(db, routine?.id ?? null, nextDay?.id ?? null);
  }

  return getSessionById(active.id);
}

export async function cancelActiveWorkout(): Promise<WorkoutSession | null> {
  const active = await getActiveSession();
  if (!active) {
    return null;
  }

  const db = await getDatabase();
  const now = new Date();
  const durationSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(active.startedAt).getTime()) / 1000)
  );

  await db.runAsync(
    `UPDATE workout_sessions
     SET status = 'canceled', ended_at = ?, duration_seconds = ?, updated_at = ?
     WHERE id = ?`,
    now.toISOString(),
    durationSeconds,
    now.toISOString(),
    active.id
  );

  return getSessionById(active.id);
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
): Promise<void> {
  const current = await getSessionById(id);
  if (!current) {
    return;
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

    await tx.runAsync(
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

    if (parts) {
      await tx.runAsync(`DELETE FROM workout_session_parts_snapshot WHERE workout_session_id = ?`, id);
      await insertSessionParts(tx as unknown as SQLite.SQLiteDatabase, id, parts);
    }
  });
}

export async function deleteSession(id: number): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(`DELETE FROM workout_session_parts_snapshot WHERE workout_session_id = ?`, id);
    await tx.runAsync(`DELETE FROM workout_sessions WHERE id = ?`, id);
  });
}

export async function getSessionById(id: number): Promise<WorkoutSession | null> {
  const sessions = await getSessions({
    sessionId: id,
    limit: 1,
  });
  return sessions[0] ?? null;
}

export async function getSessions(options?: {
  statuses?: SessionStatus[];
  sessionId?: number;
  limit?: number;
  /** ISO timestamp; only sessions started at or after this instant. */
  sinceStartedAt?: string;
}): Promise<WorkoutSession[]> {
  const db = await getDatabase();
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

/** Completed-session count, total duration, and split totals since the given instant. */
async function getCompletedRangeStats(
  sinceIso: string,
  routineDays: RoutineDay[]
): Promise<RangeStats> {
  const db = await getDatabase();
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
async function getDashboardStats(now: Date): Promise<DashboardStats> {
  const db = await getDatabase();
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

export async function getOverview(now = new Date()): Promise<AppOverview> {
  const bodyParts = await getBodyParts(false);
  const activeRoutine = await getActiveRoutine();
  const routineDays = await getRoutineDays(activeRoutine?.id);
  let progress = await getRoutineProgress();
  const db = await getDatabase();

  if (activeRoutine && !progress) {
    const firstDay = getNextRoutineDay(routineDays, null);
    await upsertRoutineProgress(db, activeRoutine.id, firstDay?.id ?? null);
    progress = await getRoutineProgress();
  }

  const sessions = await getSessions({ limit: 50 });
  // Query the active session directly: it may have started long ago (sessions
  // are never auto-closed) and must be found regardless of the recency cap.
  const activeSession = (await getSessions({ statuses: ['active'], limit: 1 }))[0] ?? null;
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
  const heatmapSessions = await getSessions({
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
    dashboard: await getDashboardStats(now),
    rangeStats: {
      last7: await getCompletedRangeStats(addLocalDays(today, -6).toISOString(), routineDays),
      last30: await getCompletedRangeStats(addLocalDays(today, -29).toISOString(), routineDays),
      last6Months: await getCompletedRangeStats(sixMonthRangeStart.toISOString(), routineDays),
      last365: await getCompletedRangeStats(addLocalDays(today, -364).toISOString(), routineDays),
    },
  };
}

export async function resetAllData(): Promise<void> {
  await resetDatabaseForDevelopment();
}
