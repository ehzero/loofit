import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import {
  workoutCoreNativeModuleAvailable,
  workoutCoreWidgetsConfigured,
  workoutCoreWidgetsDirectory,
} from '@/modules/loofit-workout-core';
import { resolveIosNativeBuildMode } from '@/src/widgets/ios-build-mode';
import {
  DATABASE_MIGRATIONS,
  DATABASE_NAME,
  DATABASE_VERSION,
  DEFAULT_BODY_PARTS,
} from './schema';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openAndMigrate();
  }
  return databasePromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const sharedDirectory = getSharedDatabaseDirectory();
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME, undefined, sharedDirectory);
  await db.execAsync('PRAGMA busy_timeout = 500');
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.withExclusiveTransactionAsync(async (tx) => {
    const version = await tx.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    await applyDatabaseMigrations(tx, version?.user_version ?? 0);
  });
  await seedDefaultBodyParts(db);
  return db;
}

async function applyDatabaseMigrations(
  db: SQLite.SQLiteDatabase,
  currentVersion: number
): Promise<void> {
  if (currentVersion > DATABASE_VERSION) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported version ${DATABASE_VERSION}.`
    );
  }
  if (currentVersion === DATABASE_VERSION) {
    return;
  }
  if (DATABASE_MIGRATIONS.at(-1)?.version !== DATABASE_VERSION) {
    throw new Error('Database migration contract does not reach the configured schema version.');
  }

  for (const migration of DATABASE_MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }

    if (migration.schemaSql.trim()) {
      await db.execAsync(migration.schemaSql);
    }
    await ensureDatabaseMigrationColumns(db, migration);
    if (migration.postSchemaSql.trim()) {
      await db.execAsync(migration.postSchemaSql);
    }
    await applyDatabaseMigrationAfterSql(db, migration);
    await db.execAsync(`PRAGMA user_version = ${migration.version}`);
  }
}

async function ensureDatabaseMigrationColumns(
  db: SQLite.SQLiteDatabase,
  migration: (typeof DATABASE_MIGRATIONS)[number]
): Promise<void> {
  for (const column of migration.columns) {
    const existingColumns = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(${column.table})`
    );
    if (!existingColumns.some((existing) => existing.name === column.column)) {
      await db.execAsync(
        `ALTER TABLE ${column.table} ADD COLUMN ${column.column} ${column.definition}`
      );
    }
  }
}

async function applyDatabaseMigrationAfterSql(
  db: SQLite.SQLiteDatabase,
  migration: (typeof DATABASE_MIGRATIONS)[number]
): Promise<void> {
  if (migration.afterSql?.trim()) {
    await db.execAsync(migration.afterSql);
  }
}

/**
 * Runs a read projection against one SQLite connection and one transaction.
 * Native platforms use expo-sqlite's dedicated transaction connection so
 * unrelated queries cannot join the transaction. Web does not support that
 * API, so it uses the database's regular transaction on its single connection.
 */
export async function withDatabaseReadTransaction<T>(
  task: (db: SQLite.SQLiteDatabase) => Promise<T>
): Promise<T> {
  const db = await getDatabase();
  const result: { value?: T } = {};

  if (Platform.OS === 'web') {
    await db.withTransactionAsync(async () => {
      result.value = await task(db);
    });
  } else {
    await db.withExclusiveTransactionAsync(async (tx) => {
      // withExclusiveTransactionAsync opens a dedicated connection, and this
      // connection-local pragma is therefore set explicitly as well.
      await tx.execAsync('PRAGMA busy_timeout = 500');
      result.value = await task(tx);
    });
  }

  if (!('value' in result)) {
    throw new Error('Database read transaction completed without a result.');
  }
  return result.value as T;
}

function getSharedDatabaseDirectory(): string | undefined {
  if (Platform.OS !== 'ios') {
    return undefined;
  }
  return (
    resolveIosNativeBuildMode(
      workoutCoreNativeModuleAvailable,
      workoutCoreWidgetsConfigured,
      workoutCoreWidgetsDirectory
    )
      .databaseDirectory ?? undefined
  );
}

export async function seedDefaultBodyParts(db: SQLite.SQLiteDatabase): Promise<void> {
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const [index, part] of DEFAULT_BODY_PARTS.entries()) {
      await tx.runAsync(
        `INSERT INTO body_parts (name, color, sort_order, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           color = body_parts.color,
           sort_order = body_parts.sort_order,
           updated_at = body_parts.updated_at`,
        part.name,
        part.color,
        index,
        now,
        now
      );
    }
  });
}
