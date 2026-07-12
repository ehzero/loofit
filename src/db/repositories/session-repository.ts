import type * as SQLite from 'expo-sqlite';

import { getRoutineDayAfterCompletion, routineDayDisplayName } from '@/src/domain/routine';
import type {
  SessionStatus,
  StartWorkoutInput,
  WorkoutSession,
  WorkoutSessionPartSnapshot,
} from '@/src/types';

import { getDatabase } from '../database';
import { getBodyPartsFromDatabase } from './body-part-repository';
import {
  getActiveRoutineFromDatabase,
  getRoutineDayByIdFromDatabase,
  getRoutineDaysFromDatabase,
  upsertRoutineProgress,
} from './routine-repository';

type SessionRow = {
  id: number;
  routine_id: number | null;
  routine_day_id: number | null;
  routine_day_name_snapshot: string | null;
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

export type GetSessionsOptions = {
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
    routineDayNameSnapshot: row.routine_day_name_snapshot,
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

export async function getSessionsFromDatabase(
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

export async function getSessionById(id: number): Promise<WorkoutSession | null> {
  return getSessionByIdFromDatabase(await getDatabase(), id);
}

export async function getActiveSessionFromDatabase(
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
    let routineDayNameSnapshot: string | null = null;
    let parts: Array<{ id: number | null; name: string; color: string }> = [];

    if (input.kind === 'routine') {
      const routineDay = await getRoutineDayByIdFromDatabase(transaction, input.routineDayId);
      if (!routineDay) {
        outcome.value = { status: 'rejected', session: null };
        return;
      }
      routineId = routineDay.routineId;
      routineDayId = routineDay.id;
      routineDayNameSnapshot = routineDayDisplayName(routineDay);
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
       (routine_id, routine_day_id, routine_day_name_snapshot, started_at, ended_at,
        duration_seconds, status, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, 0, 'active', NULL, ?, ?)`,
      routineId,
      routineDayId,
      routineDayNameSnapshot,
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
    let routineDayNameSnapshot: string | null = null;
    let parts: Array<{ id: number | null; name: string; color: string }> = [];

    if (input.kind === 'routine') {
      const routineDay = await getRoutineDayByIdFromDatabase(transaction, input.routineDayId);
      if (!routineDay) {
        outcome.value = { status: 'rejected', session: active };
        return;
      }
      routineId = routineDay.routineId;
      routineDayId = routineDay.id;
      routineDayNameSnapshot = routineDayDisplayName(routineDay);
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
       SET routine_id = ?, routine_day_id = ?, routine_day_name_snapshot = ?, updated_at = ?
       WHERE id = ? AND status = 'active'`,
      routineId,
      routineDayId,
      routineDayNameSnapshot,
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
    const transaction = tx as unknown as SQLite.SQLiteDatabase;
    let routineId = current.routineId;
    let routineDayId = current.routineDayId;
    let routineDayNameSnapshot = current.routineDayNameSnapshot;
    let parts: Array<{ id: number | null; name: string; color: string }> | null = null;

    const requestsFreeTarget =
      updates.routineDayId === null ||
      (updates.routineDayId === undefined &&
        current.routineDayId === null &&
        updates.bodyPartIds !== undefined);

    if (requestsFreeTarget) {
      const requestedBodyPartIds =
        updates.bodyPartIds ??
        (current.routineDayId === null ? sessionBodyPartIds(current.parts) : []);
      const targetChanged =
        current.routineDayId !== null ||
        !sameBodyPartIds(current.parts, requestedBodyPartIds);

      routineId = null;
      routineDayId = null;
      routineDayNameSnapshot = null;
      if (targetChanged) {
        parts = await buildFreeSessionParts(
          transaction,
          current.routineDayId === null ? current.parts : [],
          requestedBodyPartIds
        );
      }
    } else if (
      updates.routineDayId !== undefined &&
      updates.routineDayId !== current.routineDayId
    ) {
      if (updates.routineDayId !== null) {
        const routineDay = await getRoutineDayByIdFromDatabase(
          transaction,
          updates.routineDayId
        );
        if (routineDay) {
          routineId = routineDay.routineId;
          routineDayId = routineDay.id;
          routineDayNameSnapshot = routineDayDisplayName(routineDay);
          parts = routineDay.parts;
        }
      }
    }

    const result = await tx.runAsync(
      `UPDATE workout_sessions
       SET status = ?, routine_id = ?, routine_day_id = ?, routine_day_name_snapshot = ?,
           started_at = ?, ended_at = ?, duration_seconds = ?, note = ?, updated_at = ?
       WHERE id = ?`,
      status,
      routineId,
      routineDayId,
      routineDayNameSnapshot,
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

function sameBodyPartIds(
  currentParts: WorkoutSessionPartSnapshot[],
  requestedBodyPartIds: number[]
): boolean {
  const currentIds = new Set(sessionBodyPartIds(currentParts));
  const requestedIds = new Set(requestedBodyPartIds);
  return (
    currentIds.size === requestedIds.size &&
    [...currentIds].every((bodyPartId) => requestedIds.has(bodyPartId))
  );
}

function sessionBodyPartIds(parts: WorkoutSessionPartSnapshot[]): number[] {
  return parts.flatMap((part) => (part.bodyPartId === null ? [] : [part.bodyPartId]));
}

async function buildFreeSessionParts(
  db: SQLite.SQLiteDatabase,
  currentParts: WorkoutSessionPartSnapshot[],
  requestedBodyPartIds: number[]
): Promise<Array<{ id: number | null; name: string; color: string }>> {
  const requestedIds = new Set(requestedBodyPartIds);
  const preservedIds = new Set<number>();
  const parts = currentParts.flatMap((part) => {
    if (part.bodyPartId !== null && !requestedIds.has(part.bodyPartId)) {
      return [];
    }
    if (part.bodyPartId !== null) {
      preservedIds.add(part.bodyPartId);
    }
    return [
      {
        id: part.bodyPartId,
        name: part.bodyPartName,
        color: part.bodyPartColor,
      },
    ];
  });

  const availableParts = await getBodyPartsFromDatabase(db, false);
  parts.push(
    ...availableParts
      .filter((part) => requestedIds.has(part.id) && !preservedIds.has(part.id))
      .map((part) => ({ id: part.id, name: part.name, color: part.color }))
  );
  return parts;
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
