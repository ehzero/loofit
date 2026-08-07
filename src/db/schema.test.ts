import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import schemaContract from '@/contracts/workout-schema.json';

import {
  DATABASE_MIGRATIONS,
  DATABASE_VERSION,
  type DatabaseSchemaMigrationStep,
} from './generated/workout-schema.generated';
import { DEFAULT_BODY_PARTS } from './schema';

describe('generated database schema', () => {
  it('includes the complete default body-part catalog without duplicate names', () => {
    const names = DEFAULT_BODY_PARTS.map((part) => part.name);

    expect(names).toContain('전신');
    expect(names).toContain('스트레칭');
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps the released baseline at version 1 and adds cloud backup as version 2', () => {
    expect(DATABASE_VERSION).toBe(2);
    expect(schemaContract.database.version).toBe(2);
    expect(schemaContract.migrations.map(({ id, version }) => ({ id, version }))).toEqual([
      { id: 'initial_schema', version: 1 },
      { id: 'workout_cloud_backup', version: 2 },
    ]);

    expect(
      schemaContract.tables.filter((table) => table.sinceVersion === 2).map((table) => table.name)
    ).toEqual(['cloud_backup_state', 'workout_sync_outbox']);
    expect(
      schemaContract.tables
        .find((table) => table.name === 'workout_sessions')
        ?.columns.filter((column) => column.sinceVersion === 2)
        .map((column) => column.name)
    ).toEqual(['sync_id', 'sync_version']);
  });

  it('covers every schema version exactly once and preserves migration phase ordering', () => {
    expect(DATABASE_MIGRATIONS.map((migration) => migration.version)).toEqual(
      Array.from({ length: DATABASE_VERSION }, (_, index) => index + 1)
    );

    for (const migration of DATABASE_MIGRATIONS) {
      expect(migration.schemaSql, migration.id).not.toMatch(/\bCREATE(?: UNIQUE)? INDEX\b/);
    }
    for (const index of schemaContract.indexes) {
      const migration = DATABASE_MIGRATIONS.find(
        (candidate) => candidate.version === index.sinceVersion
      );
      expect(migration, index.name).toBeDefined();
      expect(migration!.schemaSql, index.name).not.toContain(index.name);
      expect(migration!.postSchemaSql, index.name).toContain(index.name);
    }
  });

  it('creates the complete schema, widget sync state, and triggers from an empty database', () => {
    const database = new DatabaseSync(':memory:');
    try {
      applyMigrations(database);

      expect(userVersion(database)).toBe(DATABASE_VERSION);
      for (const table of schemaContract.tables) {
        expect(tableNames(database), table.name).toContain(table.name);
        expect(columnNames(database, table.name), table.name).toEqual(
          table.columns.map((column) => column.name)
        );
      }
      for (const index of schemaContract.indexes) {
        expect(indexNames(database), index.name).toContain(index.name);
      }

      expect(
        database
          .prepare(
            'SELECT desired_revision, published_revision FROM widget_sync_state WHERE id = 1'
          )
          .get()
      ).toMatchObject({ desired_revision: 1, published_revision: 0 });

      const expectedTriggerNames = schemaContract.widgetSync.trackedTables.flatMap((table) =>
        schemaContract.widgetSync.operations.map(
          (operation) => `widget_sync_${table}_${operation.toLowerCase()}`
        )
      );
      expect(triggerNames(database).sort()).toEqual(
        [
          ...expectedTriggerNames,
          'workout_cloud_sync_after_delete',
          'workout_cloud_sync_after_insert',
          'workout_cloud_sync_after_reopen',
          'workout_cloud_sync_after_update',
        ].sort()
      );

      const now = '2026-07-12T12:00:00.000Z';
      database
        .prepare(
          `INSERT INTO body_parts
            (name, color, sort_order, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run('가슴', '#E84A5F', 0, 0, now, now);
      expect(
        database.prepare('SELECT desired_revision FROM widget_sync_state WHERE id = 1').get()
      ).toMatchObject({ desired_revision: 2 });
    } finally {
      database.close();
    }
  });

  it('enforces a single active workout session in the baseline schema', () => {
    const database = new DatabaseSync(':memory:');
    try {
      applyMigrations(database);

      insertActiveSession(database, 1);
      expect(() => insertActiveSession(database, 2)).toThrow();
    } finally {
      database.close();
    }
  });

  it('queues terminal workout upserts, edits, and deletes with monotonic versions', () => {
    const database = new DatabaseSync(':memory:');
    try {
      applyMigrations(database);

      insertActiveSession(database, 1);
      const active = database
        .prepare('SELECT sync_id, sync_version FROM workout_sessions WHERE id = 1')
        .get() as { sync_id: string; sync_version: number };
      expect(active.sync_id).toMatch(/^[a-f0-9]{32}$/);
      expect(active.sync_version).toBe(0);
      expect(database.prepare('SELECT COUNT(*) AS count FROM workout_sync_outbox').get())
        .toMatchObject({ count: 0 });

      database
        .prepare(
          `UPDATE workout_sessions
           SET status = 'completed', ended_at = ?, duration_seconds = 600, updated_at = ?
           WHERE id = 1`
        )
        .run('2026-07-12T12:10:00.000Z', '2026-07-12T12:10:00.000Z');
      expect(syncState(database, active.sync_id)).toEqual({
        operation: 'UPSERT',
        sync_version: 1,
      });

      database
        .prepare(`UPDATE workout_sessions SET note = ?, updated_at = ? WHERE id = 1`)
        .run('수정됨', '2026-07-12T12:11:00.000Z');
      expect(syncState(database, active.sync_id)).toEqual({
        operation: 'UPSERT',
        sync_version: 2,
      });

      database.prepare('DELETE FROM workout_sessions WHERE id = 1').run();
      expect(syncState(database, active.sync_id)).toEqual({
        operation: 'DELETE',
        sync_version: 3,
      });
    } finally {
      database.close();
    }
  });
});

function applyMigrations(database: DatabaseSync): void {
  let currentVersion = userVersion(database);
  for (const migration of DATABASE_MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }
    applyMigration(database, migration);
    currentVersion = migration.version;
  }
}

function applyMigration(database: DatabaseSync, migration: DatabaseSchemaMigrationStep): void {
  database.exec('BEGIN IMMEDIATE');
  try {
    if (migration.schemaSql.trim()) {
      database.exec(migration.schemaSql);
    }
    ensureMigrationColumns(database, migration);
    if (migration.postSchemaSql.trim()) {
      database.exec(migration.postSchemaSql);
    }
    if (migration.afterSql?.trim()) {
      database.exec(migration.afterSql);
    }
    database.exec(`PRAGMA user_version = ${migration.version}`);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function ensureMigrationColumns(
  database: DatabaseSync,
  migration: DatabaseSchemaMigrationStep
): void {
  for (const column of migration.columns) {
    if (!columnNames(database, column.table).includes(column.column)) {
      database.exec(
        `ALTER TABLE ${column.table} ADD COLUMN ${column.column} ${column.definition}`
      );
    }
  }
}

function insertActiveSession(database: DatabaseSync, id: number): void {
  const now = '2026-07-12T12:00:00.000Z';
  database
    .prepare(
      `INSERT INTO workout_sessions
        (id, routine_id, routine_day_id, routine_day_name_snapshot, started_at, ended_at,
         duration_seconds, status, note, created_at, updated_at)
       VALUES (?, 10, 101, 'Push', ?, NULL, 0, 'active', NULL, ?, ?)`
    )
    .run(id, now, now, now);
}

function userVersion(database: DatabaseSync): number {
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

function tableNames(database: DatabaseSync): string[] {
  return (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

function columnNames(database: DatabaseSync, table: string): string[] {
  return (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (column) => column.name
  );
}

function indexNames(database: DatabaseSync): string[] {
  return (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

function triggerNames(database: DatabaseSync): string[] {
  return (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

function syncState(
  database: DatabaseSync,
  syncId: string
): { operation: string; sync_version: number } | undefined {
  return database
    .prepare(
      'SELECT operation, sync_version FROM workout_sync_outbox WHERE sync_id = ?'
    )
    .get(syncId) as { operation: string; sync_version: number } | undefined;
}
