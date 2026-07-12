import type * as SQLite from 'expo-sqlite';

import type { BodyPart } from '@/src/types';

import { getDatabase } from '../database';
import { DEFAULT_BODY_PARTS } from '../schema';

export type BodyPartRow = {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
};

export function mapBodyPart(row: BodyPartRow): BodyPart {
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

export async function getBodyPartsFromDatabase(
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
