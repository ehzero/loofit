import type * as SQLite from 'expo-sqlite';

import type {
  Routine,
  RoutineDay,
  RoutineProgress,
  RoutineTemplate,
  RoutineTemplateCustomization,
} from '@/src/types';

import { ROUTINE_TEMPLATES } from '@/src/config/routine-templates';
import { getDatabase } from '../database';
import {
  getBodyPartsFromDatabase,
  mapBodyPart,
  type BodyPartRow,
} from './body-part-repository';

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

type RoutineProgressRow = {
  active_routine_id: number | null;
  next_routine_day_id: number | null;
  updated_at: string;
};

function mapRoutine(row: RoutineRow): Routine {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRoutineDay(row: RoutineDayRow, parts: RoutineDay['parts']): RoutineDay {
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

export async function getActiveRoutineFromDatabase(
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

export async function getRoutineDaysFromDatabase(
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

export async function getRoutineDays(
  routineId: number | null | undefined
): Promise<RoutineDay[]> {
  return getRoutineDaysFromDatabase(await getDatabase(), routineId);
}

export async function getRoutineProgressFromDatabase(
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

export async function upsertRoutineProgress(
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

export async function createRoutineFromTemplate(
  template: RoutineTemplate,
  customization?: RoutineTemplateCustomization
): Promise<boolean> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const config = ROUTINE_TEMPLATES[template];
  const availableBodyParts = await getBodyPartsFromDatabase(db, false);
  const bodyPartIdByName = new Map(availableBodyParts.map((part) => [part.name, part.id]));
  const availableBodyPartIds = new Set(availableBodyParts.map((part) => part.id));
  const days = config.days.map((day, dayIndex) => ({
    name: (customization?.days[dayIndex]?.alias ?? day.name).trim(),
    bodyPartIds:
      customization?.days[dayIndex]?.bodyPartIds ??
      day.parts
        .map((partName) => bodyPartIdByName.get(partName))
        .filter((id): id is number => id !== undefined),
  }));

  const hasValidCustomization =
    !customization ||
    (customization.days.length === config.days.length &&
      days.every(
        (day) =>
          day.bodyPartIds.length > 0 &&
          new Set(day.bodyPartIds).size === day.bodyPartIds.length &&
          day.bodyPartIds.every((id) => availableBodyPartIds.has(id))
      ));
  if (!hasValidCustomization || days.some((day) => day.bodyPartIds.length === 0)) {
    return false;
  }

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

    for (const [dayIndex, day] of days.entries()) {
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

      for (const [partIndex, bodyPartId] of day.bodyPartIds.entries()) {
        await tx.runAsync(
          `INSERT INTO routine_day_parts (routine_day_id, body_part_id, sort_order)
           VALUES (?, ?, ?)`,
          routineDayId,
          bodyPartId,
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

export async function getRoutineDayByIdFromDatabase(
  db: SQLite.SQLiteDatabase,
  id: number
): Promise<RoutineDay | null> {
  const activeRoutine = await getActiveRoutineFromDatabase(db);
  const routineDays = await getRoutineDaysFromDatabase(db, activeRoutine?.id);
  return routineDays.find((day) => day.id === id) ?? null;
}
