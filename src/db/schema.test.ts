import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import schemaContract from '@/contracts/workout-schema.json';

import {
  DATABASE_MIGRATIONS,
  DATABASE_VERSION,
  type DatabaseSchemaMigrationStep,
} from './generated/workout-schema.generated';

describe('generated database migrations', () => {
  it('covers every schema version exactly once and in order', () => {
    expect(DATABASE_MIGRATIONS.map((migration) => migration.version)).toEqual(
      Array.from({ length: DATABASE_VERSION }, (_, index) => index + 1)
    );
  });

  it('emits indexes only after same-version column migrations', () => {
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

    const snapshotMigration = DATABASE_MIGRATIONS.find((migration) => migration.version === 3);
    expect(snapshotMigration?.schemaSql).not.toContain('routine_day_name_snapshot');
    expect(snapshotMigration?.columns).toContainEqual({
      table: 'workout_sessions',
      column: 'routine_day_name_snapshot',
      definition: 'TEXT',
    });
    expect(snapshotMigration?.postSchemaSql).toContain('CREATE TRIGGER');
    expect(snapshotMigration?.afterSql).toContain('SET routine_day_name_snapshot');
  });

  it('applies the v2 to v3 column migration and backfill idempotently', () => {
    const database = new DatabaseSync(':memory:');
    try {
      applyMigrations(database, 2);
      expect(userVersion(database)).toBe(2);
      expect(columnNames(database, 'workout_sessions')).not.toContain(
        'routine_day_name_snapshot'
      );

      const now = '2026-07-11T12:00:00.000Z';
      database.exec(`
        INSERT INTO routine_days
          (id, routine_id, name, sort_order, created_at, updated_at)
        VALUES (101, 10, ' ', 0, '${now}', '${now}');
        INSERT INTO workout_sessions
          (id, routine_id, routine_day_id, started_at, ended_at, duration_seconds,
           status, note, created_at, updated_at)
        VALUES
          (501, 10, 101, '${now}', '${now}', 60, 'completed', NULL, '${now}', '${now}');
        INSERT INTO workout_session_parts_snapshot
          (workout_session_id, body_part_id, body_part_name, body_part_color, sort_order)
        VALUES (501, 1, '가슴', '#E84A5F', 0);
      `);

      applyMigrations(database);

      expect(userVersion(database)).toBe(DATABASE_VERSION);
      expect(columnNames(database, 'workout_sessions')).toContain(
        'routine_day_name_snapshot'
      );
      expect(
        database
          .prepare('SELECT routine_day_name_snapshot AS title FROM workout_sessions WHERE id = 501')
          .get()
      ).toMatchObject({ title: '가슴' });

      database.exec('UPDATE workout_sessions SET routine_day_name_snapshot = NULL WHERE id = 501');
      applyMigrations(database);
      expect(
        database
          .prepare('SELECT routine_day_name_snapshot AS title FROM workout_sessions WHERE id = 501')
          .get()
      ).toMatchObject({ title: '가슴' });

      database.exec('PRAGMA user_version = 2');
      applyMigrations(database);

      expect(
        columnNames(database, 'workout_sessions').filter(
          (column) => column === 'routine_day_name_snapshot'
        )
      ).toHaveLength(1);
      expect(
        database
          .prepare('SELECT routine_day_name_snapshot AS title FROM workout_sessions WHERE id = 501')
          .get()
      ).toMatchObject({ title: '가슴' });
    } finally {
      database.close();
    }
  });
});

function applyMigrations(database: DatabaseSync, maximumVersion = DATABASE_VERSION): void {
  const startingVersion = userVersion(database);
  let currentVersion = startingVersion;
  for (const migration of DATABASE_MIGRATIONS) {
    if (migration.version <= currentVersion || migration.version > maximumVersion) {
      continue;
    }
    applyMigration(database, migration);
    currentVersion = migration.version;
  }
  for (const migration of DATABASE_MIGRATIONS) {
    if (migration.version <= startingVersion) {
      ensureMigrationColumns(database, migration);
      applyMigrationAfterSql(database, migration);
    }
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
    applyMigrationAfterSql(database, migration);
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

function applyMigrationAfterSql(
  database: DatabaseSync,
  migration: DatabaseSchemaMigrationStep
): void {
  if (migration.afterSql?.trim()) {
    database.exec(migration.afterSql);
  }
}

function userVersion(database: DatabaseSync): number {
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number };
  return row.user_version;
}

function columnNames(database: DatabaseSync, table: string): string[] {
  return (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (column) => column.name
  );
}
