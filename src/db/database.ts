import * as SQLite from 'expo-sqlite';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { widgetsDirectory } from 'expo-widgets';

import { DATABASE_NAME, DATABASE_VERSION, DEFAULT_BODY_PARTS, MIGRATION_SQL } from './schema';

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
  if (sharedDirectory) {
    await migrateDefaultDatabaseToSharedDirectory(db);
  }
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.withExclusiveTransactionAsync(async (tx) => {
    const version = await tx.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((version?.user_version ?? 0) < DATABASE_VERSION) {
      await tx.execAsync(MIGRATION_SQL);
      await tx.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
    }
  });
  await seedDefaultBodyParts(db);
  return db;
}

function getSharedDatabaseDirectory(): string | undefined {
  if (Platform.OS !== 'ios' || Constants.expoConfig?.extra?.widgetsEnabled !== true) {
    return undefined;
  }
  return widgetsDirectory || undefined;
}

async function migrateDefaultDatabaseToSharedDirectory(
  sharedDb: SQLite.SQLiteDatabase
): Promise<void> {
  const sharedVersion = await sharedDb.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((sharedVersion?.user_version ?? 0) > 0) {
    return;
  }

  const defaultDb = await SQLite.openDatabaseAsync(DATABASE_NAME, { useNewConnection: true });
  try {
    const defaultVersion = await defaultDb.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version'
    );
    if ((defaultVersion?.user_version ?? 0) > 0) {
      await SQLite.backupDatabaseAsync({
        sourceDatabase: defaultDb,
        destDatabase: sharedDb,
      });
    }
  } finally {
    await defaultDb.closeAsync();
  }
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

export async function resetDatabaseForDevelopment(): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.execAsync(`
      DELETE FROM workout_session_parts_snapshot;
      DELETE FROM workout_sessions;
      DELETE FROM routine_day_parts;
      DELETE FROM routine_days;
      DELETE FROM routines;
      DELETE FROM routine_progress;
      DELETE FROM app_settings;
      DELETE FROM body_parts;
    `);
  });
  await seedDefaultBodyParts(db);
}
