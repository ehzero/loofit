import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedDatabase = vi.hoisted(() => ({ current: null as TestDatabase | null }));

vi.mock('@/src/db/database', () => ({
  getDatabase: async () => {
    if (!mockedDatabase.current) {
      throw new Error('Workout sync test database is not configured.');
    }
    return mockedDatabase.current;
  },
}));

import { MIGRATION_SQL } from '@/src/db/schema';
import {
  applyWorkoutSyncResults,
  getWorkoutBackupLocalState,
  mergeWorkoutBackup,
  prepareWorkoutSyncBatch,
  WorkoutRestoreActiveSessionError,
  WorkoutSyncOwnerMismatchError,
} from './workout-sync-repository';

describe('local workout sync repository', () => {
  beforeEach(() => {
    mockedDatabase.current = new TestDatabase();
    mockedDatabase.current.exec(MIGRATION_SQL);
  });

  afterEach(() => {
    mockedDatabase.current?.close();
    mockedDatabase.current = null;
  });

  it('binds the dataset owner and serializes a terminal workout snapshot', async () => {
    const database = currentDatabase();
    const syncId = insertCompletedWorkout(database);

    const batch = await prepareWorkoutSyncBatch('user-1');

    expect(batch.datasetId).toMatch(/^[a-f0-9]{32}$/);
    expect(batch.operations).toEqual([
      {
        type: 'UPSERT',
        syncId,
        version: 1,
        record: {
          status: 'completed',
          routineDayNameSnapshot: 'Push',
          startedAt: '2026-08-07T01:00:00.000Z',
          endedAt: '2026-08-07T02:00:00.000Z',
          durationSeconds: 3_600,
          note: '좋은 운동',
          createdAt: '2026-08-07T01:00:00.000Z',
          updatedAt: '2026-08-07T02:00:00.000Z',
          parts: [{ name: '가슴', color: '#E84A5F', sortOrder: 0 }],
        },
      },
    ]);
    expect(
      database.getFirst<{ owner_user_id: string }>(
        'SELECT owner_user_id FROM cloud_backup_state WHERE id = 1'
      )
    ).toEqual({ owner_user_id: 'user-1' });
  });

  it('acknowledges an exact version without deleting a newer edit', async () => {
    const database = currentDatabase();
    const syncId = insertCompletedWorkout(database);
    await prepareWorkoutSyncBatch('user-1');

    database.run(
      `UPDATE workout_sessions SET note = ?, updated_at = ? WHERE sync_id = ?`,
      '더 최신 메모',
      '2026-08-07T02:10:00.000Z',
      syncId
    );
    await applyWorkoutSyncResults([
      { syncId, version: 1, status: 'APPLIED' },
    ]);

    expect(
      database.getFirst<{ sync_version: number }>(
        'SELECT sync_version FROM workout_sync_outbox WHERE sync_id = ?',
        syncId
      )
    ).toEqual({ sync_version: 2 });
  });

  it('bumps a local operation above a conflicting server version', async () => {
    const database = currentDatabase();
    const syncId = insertCompletedWorkout(database);
    await prepareWorkoutSyncBatch('user-1');

    await applyWorkoutSyncResults([
      {
        syncId,
        version: 1,
        status: 'CONFLICT',
        serverVersion: 4,
      },
    ]);

    expect(
      database.getFirst<{ session_version: number; outbox_version: number }>(
        `SELECT ws.sync_version AS session_version,
                outbox.sync_version AS outbox_version
         FROM workout_sessions ws
         JOIN workout_sync_outbox outbox ON outbox.sync_id = ws.sync_id
         WHERE ws.sync_id = ?`,
        syncId
      )
    ).toEqual({ session_version: 5, outbox_version: 5 });
  });

  it('retains a deletion operation after the local workout row is removed', async () => {
    const database = currentDatabase();
    const syncId = insertCompletedWorkout(database);
    database.run('DELETE FROM workout_sessions WHERE sync_id = ?', syncId);

    const batch = await prepareWorkoutSyncBatch('user-1');

    expect(batch.operations).toEqual([
      { type: 'DELETE', syncId, version: 2 },
    ]);
  });

  it('never uploads a bound local dataset to another account', async () => {
    insertCompletedWorkout(currentDatabase());
    await prepareWorkoutSyncBatch('user-1');

    await expect(prepareWorkoutSyncBatch('user-2')).rejects.toBeInstanceOf(
      WorkoutSyncOwnerMismatchError
    );
  });

  it('merges remote history without removing local-only workouts', async () => {
    const database = currentDatabase();
    const localSyncId = insertCompletedWorkout(database);
    const remoteSyncId = 'f'.repeat(32);

    const result = await mergeWorkoutBackup('user-1', 'd'.repeat(32), [
      remoteUpsert(remoteSyncId, 3, '서버 운동'),
    ]);

    expect(result).toMatchObject({ added: 1, queuedLocal: 1, deleted: 0 });
    expect(
      database.getFirst<{ dataset_id: string; owner_user_id: string }>(
        `SELECT dataset_id, owner_user_id FROM cloud_backup_state WHERE id = 1`
      )
    ).toEqual({ dataset_id: 'd'.repeat(32), owner_user_id: 'user-1' });
    expect(
      database.getFirst<{ operation: string; sync_version: number }>(
        `SELECT operation, sync_version FROM workout_sync_outbox WHERE sync_id = ?`,
        localSyncId
      )
    ).toEqual({ operation: 'UPSERT', sync_version: 1 });
    expect(
      database.getFirst<{ note: string; sync_version: number; routine_id: null }>(
        `SELECT note, sync_version, routine_id
         FROM workout_sessions WHERE sync_id = ?`,
        remoteSyncId
      )
    ).toEqual({ note: '서버 운동', sync_version: 3, routine_id: null });
    expect(
      database.getFirst(`SELECT sync_id FROM workout_sync_outbox WHERE sync_id = ?`, remoteSyncId)
    ).toBeUndefined();
  });

  it('applies a newer server version and a newer tombstone deterministically', async () => {
    const database = currentDatabase();
    const updatedSyncId = insertCompletedWorkout(database);
    const deletedSyncId = insertCompletedWorkout(database);
    database.run(
      `UPDATE workout_sessions SET sync_version = 2 WHERE sync_id = ?`,
      updatedSyncId
    );

    const result = await mergeWorkoutBackup('user-1', 'e'.repeat(32), [
      remoteUpsert(updatedSyncId, 4, '복원된 최신 메모'),
      { type: 'DELETE', syncId: deletedSyncId, version: 2 },
    ]);

    expect(result).toMatchObject({ updated: 1, deleted: 1 });
    expect(
      database.getFirst<{ note: string; sync_version: number }>(
        `SELECT note, sync_version FROM workout_sessions WHERE sync_id = ?`,
        updatedSyncId
      )
    ).toEqual({ note: '복원된 최신 메모', sync_version: 4 });
    expect(
      database.getFirst(`SELECT id FROM workout_sessions WHERE sync_id = ?`, deletedSyncId)
    ).toBeUndefined();
  });

  it('blocks restore while a workout is active', async () => {
    const database = currentDatabase();
    database.run(
      `INSERT INTO workout_sessions
        (routine_id, routine_day_id, routine_day_name_snapshot, started_at, ended_at,
         duration_seconds, status, note, created_at, updated_at)
       VALUES
        (10, 101, 'Push', '2026-08-07T03:00:00.000Z', NULL, 0, 'active', NULL,
         '2026-08-07T03:00:00.000Z', '2026-08-07T03:00:00.000Z')`
    );

    await expect(
      mergeWorkoutBackup('user-1', 'd'.repeat(32), [])
    ).rejects.toBeInstanceOf(WorkoutRestoreActiveSessionError);
  });

  it('reports local backup compatibility without binding an unused dataset', async () => {
    const state = await getWorkoutBackupLocalState('user-1');
    expect(state).toMatchObject({
      ownerUserId: null,
      terminalRecordCount: 0,
      pendingOperationCount: 0,
      hasActiveSession: false,
    });
  });
});

function currentDatabase(): TestDatabase {
  if (!mockedDatabase.current) {
    throw new Error('Missing workout sync test database.');
  }
  return mockedDatabase.current;
}

function insertCompletedWorkout(database: TestDatabase): string {
  database.run(
    `INSERT INTO workout_sessions
      (routine_id, routine_day_id, routine_day_name_snapshot, started_at, ended_at,
       duration_seconds, status, note, created_at, updated_at)
     VALUES
      (10, 101, 'Push', '2026-08-07T01:00:00.000Z', '2026-08-07T02:00:00.000Z',
       3600, 'completed', '좋은 운동', '2026-08-07T01:00:00.000Z',
       '2026-08-07T02:00:00.000Z')`
  );
  const session = database.getFirst<{ id: number; sync_id: string }>(
    `SELECT id, sync_id FROM workout_sessions ORDER BY id DESC LIMIT 1`
  );
  if (!session) {
    throw new Error('Failed to insert a workout sync fixture.');
  }
  database.run(
    `INSERT INTO workout_session_parts_snapshot
      (workout_session_id, body_part_id, body_part_name, body_part_color, sort_order)
     VALUES (?, 1, '가슴', '#E84A5F', 0)`,
    session.id
  );
  return session.sync_id;
}

function remoteUpsert(syncId: string, version: number, note: string) {
  return {
    type: 'UPSERT' as const,
    syncId,
    version,
    record: {
      status: 'completed' as const,
      routineDayNameSnapshot: 'Push',
      startedAt: '2026-08-06T01:00:00.000Z',
      endedAt: '2026-08-06T02:00:00.000Z',
      durationSeconds: 3_600,
      note,
      createdAt: '2026-08-06T01:00:00.000Z',
      updatedAt: '2026-08-06T02:00:00.000Z',
      parts: [{ name: '가슴', color: '#E84A5F', sortOrder: 0 }],
    },
  };
}

class TestDatabase {
  private readonly database = new DatabaseSync(':memory:');

  exec(sql: string): void {
    this.database.exec(sql);
  }

  run(sql: string, ...parameters: unknown[]): void {
    this.database.prepare(sql).run(...parameters as never[]);
  }

  getFirst<T>(sql: string, ...parameters: unknown[]): T | undefined {
    return this.database.prepare(sql).get(...parameters as never[]) as T | undefined;
  }

  async runAsync(sql: string, ...parameters: unknown[]) {
    const normalized = normalizeParameters(parameters);
    const result = this.database.prepare(sql).run(...normalized as never[]);
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }

  async getFirstAsync<T>(sql: string, ...parameters: unknown[]): Promise<T | null> {
    return (this.database.prepare(sql).get(...normalizeParameters(parameters) as never[]) as T)
      ?? null;
  }

  async getAllAsync<T>(sql: string, ...parameters: unknown[]): Promise<T[]> {
    return this.database.prepare(sql).all(...normalizeParameters(parameters) as never[]) as T[];
  }

  async withExclusiveTransactionAsync<T>(task: (database: TestDatabase) => Promise<T>): Promise<T> {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = await task(this);
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

function normalizeParameters(parameters: unknown[]): unknown[] {
  return parameters.length === 1 && Array.isArray(parameters[0])
    ? parameters[0]
    : parameters;
}
