import type * as SQLite from 'expo-sqlite';

import { getDatabase } from '../database';

export type WorkoutBackupPart = {
  name: string;
  color: string;
  sortOrder: number;
};

export type WorkoutBackupRecord = {
  status: 'completed' | 'canceled';
  routineDayNameSnapshot: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  parts: WorkoutBackupPart[];
};

export type WorkoutSyncOperation =
  | {
      type: 'UPSERT';
      syncId: string;
      version: number;
      record: WorkoutBackupRecord;
    }
  | {
      type: 'DELETE';
      syncId: string;
      version: number;
    };

export type WorkoutSyncBatch = {
  datasetId: string;
  operations: WorkoutSyncOperation[];
};

export type WorkoutSyncServerResult = {
  syncId: string;
  version: number;
  status: 'APPLIED' | 'ALREADY_APPLIED' | 'CONFLICT';
  serverVersion?: number;
};

type BackupStateRow = {
  dataset_id: string;
  owner_user_id: string | null;
  last_successful_sync_at?: string | null;
};

type OutboxRow = {
  sync_id: string;
  operation: 'UPSERT' | 'DELETE';
  sync_version: number;
};

type SessionRow = {
  sync_id: string;
  sync_version: number;
  routine_day_name_snapshot: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  status: 'completed' | 'canceled';
  note: string | null;
  created_at: string;
  updated_at: string;
};

type PartRow = {
  session_sync_id: string;
  body_part_name: string;
  body_part_color: string;
  sort_order: number;
};

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 50;
const MAX_SYNC_ERROR_LENGTH = 1_000;

export type WorkoutBackupLocalState = {
  datasetId: string;
  ownerUserId: string | null;
  terminalRecordCount: number;
  pendingOperationCount: number;
  hasActiveSession: boolean;
  lastSuccessfulSyncAt: string | null;
};

export type WorkoutBackupMergeResult = {
  added: number;
  updated: number;
  deleted: number;
  keptLocal: number;
  queuedLocal: number;
};

export class WorkoutSyncOwnerMismatchError extends Error {
  constructor() {
    super('The local workout dataset belongs to another Loofit user.');
    this.name = 'WorkoutSyncOwnerMismatchError';
  }
}

export class WorkoutRestoreActiveSessionError extends Error {
  constructor() {
    super('An active workout must finish before restoring a workout backup.');
    this.name = 'WorkoutRestoreActiveSessionError';
  }
}

const ensureBackupState = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  await db.runAsync(
    `INSERT OR IGNORE INTO cloud_backup_state
      (id, dataset_id, owner_user_id, last_successful_sync_at, last_error, updated_at)
     VALUES
      (1, lower(hex(randomblob(16))), NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
  );
};

export async function getWorkoutBackupLocalState(
  userId: string
): Promise<WorkoutBackupLocalState> {
  if (!userId) {
    throw new Error('userId is required to inspect workout backup state.');
  }
  const db = await getDatabase();
  const result: { state?: WorkoutBackupLocalState } = {};
  await db.withExclusiveTransactionAsync(async (tx) => {
    const transaction = tx as unknown as SQLite.SQLiteDatabase;
    await ensureBackupState(transaction);
    const state = await transaction.getFirstAsync<BackupStateRow>(
      `SELECT dataset_id, owner_user_id, last_successful_sync_at
       FROM cloud_backup_state WHERE id = 1`
    );
    if (!state) {
      throw new Error('Cloud backup state is unavailable.');
    }
    if (state.owner_user_id && state.owner_user_id !== userId) {
      throw new WorkoutSyncOwnerMismatchError();
    }
    const counts = await transaction.getFirstAsync<{
      terminal_count: number;
      active_count: number;
      pending_count: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM workout_sessions
          WHERE status IN ('completed', 'canceled')) AS terminal_count,
         (SELECT COUNT(*) FROM workout_sessions
          WHERE status = 'active') AS active_count,
         (SELECT COUNT(*) FROM workout_sync_outbox) AS pending_count`
    );
    if (!counts) {
      throw new Error('Workout backup counts are unavailable.');
    }
    result.state = {
      datasetId: state.dataset_id,
      ownerUserId: state.owner_user_id,
      terminalRecordCount: counts.terminal_count,
      pendingOperationCount: counts.pending_count,
      hasActiveSession: counts.active_count > 0,
      lastSuccessfulSyncAt: state.last_successful_sync_at ?? null,
    };
  });
  if (!result.state) {
    throw new Error('Workout backup state transaction completed without a result.');
  }
  return result.state;
}

type RestoreSessionRow = {
  id: number;
  sync_id: string;
  sync_version: number;
  status: 'completed' | 'canceled';
};

const enqueueLocalWorkout = async (
  db: SQLite.SQLiteDatabase,
  session: RestoreSessionRow,
  now: string
): Promise<void> => {
  await db.runAsync(
    `INSERT INTO workout_sync_outbox
      (sync_id, operation, sync_version, created_at, attempt_count, last_error)
     VALUES (?, 'UPSERT', ?, ?, 0, NULL)
     ON CONFLICT(sync_id) DO UPDATE SET
       operation = excluded.operation,
       sync_version = excluded.sync_version,
       created_at = excluded.created_at,
       attempt_count = 0,
       last_error = NULL`,
    session.sync_id,
    session.sync_version,
    now
  );
};

const insertRestoredParts = async (
  db: SQLite.SQLiteDatabase,
  sessionId: number,
  parts: readonly WorkoutBackupPart[]
): Promise<void> => {
  for (const part of parts) {
    await db.runAsync(
      `INSERT INTO workout_session_parts_snapshot
        (workout_session_id, body_part_id, body_part_name, body_part_color, sort_order)
       VALUES (?, NULL, ?, ?, ?)`,
      sessionId,
      part.name,
      part.color,
      part.sortOrder
    );
  }
};

export async function mergeWorkoutBackup(
  userId: string,
  remoteDatasetId: string,
  operations: readonly WorkoutSyncOperation[]
): Promise<WorkoutBackupMergeResult> {
  if (!userId || !/^[a-f0-9]{32}$/.test(remoteDatasetId)) {
    throw new Error('Valid userId and remoteDatasetId are required to restore a backup.');
  }
  const operationIds = new Set<string>();
  for (const operation of operations) {
    if (operationIds.has(operation.syncId)) {
      throw new Error(`Duplicate workout backup operation for ${operation.syncId}.`);
    }
    operationIds.add(operation.syncId);
  }

  const db = await getDatabase();
  const mergeResult: WorkoutBackupMergeResult = {
    added: 0,
    updated: 0,
    deleted: 0,
    keptLocal: 0,
    queuedLocal: 0,
  };
  await db.withExclusiveTransactionAsync(async (tx) => {
    const transaction = tx as unknown as SQLite.SQLiteDatabase;
    await ensureBackupState(transaction);
    const state = await transaction.getFirstAsync<BackupStateRow>(
      `SELECT dataset_id, owner_user_id FROM cloud_backup_state WHERE id = 1`
    );
    if (!state) {
      throw new Error('Cloud backup state is unavailable.');
    }
    if (state.owner_user_id && state.owner_user_id !== userId) {
      throw new WorkoutSyncOwnerMismatchError();
    }
    const active = await transaction.getFirstAsync<{ id: number }>(
      `SELECT id FROM workout_sessions WHERE status = 'active' LIMIT 1`
    );
    if (active) {
      throw new WorkoutRestoreActiveSessionError();
    }

    const localSessions = await transaction.getAllAsync<RestoreSessionRow>(
      `SELECT id, sync_id, sync_version, status
       FROM workout_sessions
       WHERE status IN ('completed', 'canceled') AND sync_id IS NOT NULL`
    );
    const localBySyncId = new Map(
      localSessions.map((session) => [session.sync_id, session])
    );
    const now = new Date().toISOString();

    for (const operation of operations) {
      const local = localBySyncId.get(operation.syncId);
      if (operation.type === 'DELETE') {
        if (!local) {
          continue;
        }
        if (operation.version >= local.sync_version) {
          await transaction.runAsync(
            `DELETE FROM workout_sessions WHERE id = ?`,
            local.id
          );
          await transaction.runAsync(
            `DELETE FROM workout_session_parts_snapshot
             WHERE workout_session_id = ?`,
            local.id
          );
          await transaction.runAsync(
            `DELETE FROM workout_sync_outbox WHERE sync_id = ?`,
            operation.syncId
          );
          localBySyncId.delete(operation.syncId);
          mergeResult.deleted += 1;
        } else {
          await enqueueLocalWorkout(transaction, local, now);
          mergeResult.keptLocal += 1;
        }
        continue;
      }

      if (!local) {
        const insert = await transaction.runAsync(
          `INSERT INTO workout_sessions
            (routine_id, routine_day_id, routine_day_name_snapshot, started_at,
             ended_at, duration_seconds, status, note, created_at, updated_at,
             sync_id, sync_version)
           VALUES (NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          operation.record.routineDayNameSnapshot,
          operation.record.startedAt,
          operation.record.endedAt,
          operation.record.durationSeconds,
          operation.record.status,
          operation.record.note,
          operation.record.createdAt,
          operation.record.updatedAt,
          operation.syncId,
          operation.version
        );
        await insertRestoredParts(
          transaction,
          insert.lastInsertRowId,
          operation.record.parts
        );
        await transaction.runAsync(
          `DELETE FROM workout_sync_outbox WHERE sync_id = ?`,
          operation.syncId
        );
        localBySyncId.set(operation.syncId, {
          id: insert.lastInsertRowId,
          sync_id: operation.syncId,
          sync_version: operation.version,
          status: operation.record.status,
        });
        mergeResult.added += 1;
        continue;
      }

      if (operation.version > local.sync_version) {
        await transaction.runAsync(
          `UPDATE workout_sessions
           SET routine_day_name_snapshot = ?, started_at = ?, ended_at = ?,
               duration_seconds = ?, status = ?, note = ?, created_at = ?,
               updated_at = ?, sync_version = ?
           WHERE id = ?`,
          operation.record.routineDayNameSnapshot,
          operation.record.startedAt,
          operation.record.endedAt,
          operation.record.durationSeconds,
          operation.record.status,
          operation.record.note,
          operation.record.createdAt,
          operation.record.updatedAt,
          operation.version,
          local.id
        );
        await transaction.runAsync(
          `DELETE FROM workout_session_parts_snapshot
           WHERE workout_session_id = ?`,
          local.id
        );
        await insertRestoredParts(transaction, local.id, operation.record.parts);
        await transaction.runAsync(
          `DELETE FROM workout_sync_outbox WHERE sync_id = ?`,
          operation.syncId
        );
        localBySyncId.set(operation.syncId, {
          ...local,
          sync_version: operation.version,
          status: operation.record.status,
        });
        mergeResult.updated += 1;
      } else if (operation.version < local.sync_version) {
        await enqueueLocalWorkout(transaction, local, now);
        mergeResult.keptLocal += 1;
      } else {
        await transaction.runAsync(
          `DELETE FROM workout_sync_outbox
           WHERE sync_id = ? AND sync_version = ?`,
          operation.syncId,
          operation.version
        );
        mergeResult.keptLocal += 1;
      }
    }

    for (const local of localBySyncId.values()) {
      if (operationIds.has(local.sync_id)) {
        continue;
      }
      await enqueueLocalWorkout(transaction, local, now);
      mergeResult.queuedLocal += 1;
    }

    await transaction.runAsync(
      `UPDATE cloud_backup_state
       SET dataset_id = ?, owner_user_id = ?, last_error = NULL, updated_at = ?
       WHERE id = 1`,
      remoteDatasetId,
      userId,
      now
    );
  });
  return mergeResult;
}

export async function prepareWorkoutSyncBatch(
  userId: string,
  limit = DEFAULT_BATCH_SIZE
): Promise<WorkoutSyncBatch> {
  if (!userId) {
    throw new Error('userId is required to prepare workout synchronization.');
  }
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_BATCH_SIZE) {
    throw new Error(`Workout sync batch limit must be between 1 and ${MAX_BATCH_SIZE}.`);
  }

  const db = await getDatabase();
  const result: { batch?: WorkoutSyncBatch } = {};
  await db.withExclusiveTransactionAsync(async (tx) => {
    const transaction = tx as unknown as SQLite.SQLiteDatabase;
    await ensureBackupState(transaction);
    const state = await transaction.getFirstAsync<BackupStateRow>(
      `SELECT dataset_id, owner_user_id FROM cloud_backup_state WHERE id = 1`
    );
    if (!state) {
      throw new Error('Cloud backup state is unavailable.');
    }
    if (state.owner_user_id && state.owner_user_id !== userId) {
      throw new WorkoutSyncOwnerMismatchError();
    }
    if (!state.owner_user_id) {
      await transaction.runAsync(
        `UPDATE cloud_backup_state
         SET owner_user_id = ?, last_error = NULL, updated_at = ?
         WHERE id = 1 AND owner_user_id IS NULL`,
        userId,
        new Date().toISOString()
      );
    }

    const outbox = await transaction.getAllAsync<OutboxRow>(
      `SELECT sync_id, operation, sync_version
       FROM workout_sync_outbox
       ORDER BY created_at ASC, sync_id ASC
       LIMIT ?`,
      limit
    );
    const upsertIds = outbox
      .filter((entry) => entry.operation === 'UPSERT')
      .map((entry) => entry.sync_id);
    const sessions = upsertIds.length
      ? await transaction.getAllAsync<SessionRow>(
          `SELECT sync_id, sync_version, routine_day_name_snapshot, started_at, ended_at,
                  duration_seconds, status, note, created_at, updated_at
           FROM workout_sessions
           WHERE sync_id IN (${upsertIds.map(() => '?').join(',')})
             AND status IN ('completed', 'canceled')`,
          upsertIds
        )
      : [];
    const parts = upsertIds.length
      ? await transaction.getAllAsync<PartRow>(
          `SELECT ws.sync_id AS session_sync_id, wsp.body_part_name, wsp.body_part_color,
                  wsp.sort_order
           FROM workout_session_parts_snapshot wsp
           JOIN workout_sessions ws ON ws.id = wsp.workout_session_id
           WHERE ws.sync_id IN (${upsertIds.map(() => '?').join(',')})
           ORDER BY ws.sync_id ASC, wsp.sort_order ASC, wsp.id ASC`,
          upsertIds
        )
      : [];
    const sessionBySyncId = new Map(sessions.map((session) => [session.sync_id, session]));

    const operations = outbox.map<WorkoutSyncOperation>((entry) => {
      if (entry.operation === 'DELETE') {
        return {
          type: 'DELETE',
          syncId: entry.sync_id,
          version: entry.sync_version,
        };
      }
      const session = sessionBySyncId.get(entry.sync_id);
      if (!session || session.sync_version !== entry.sync_version) {
        throw new Error(`Workout sync outbox is inconsistent for ${entry.sync_id}.`);
      }
      return {
        type: 'UPSERT',
        syncId: entry.sync_id,
        version: entry.sync_version,
        record: {
          status: session.status,
          routineDayNameSnapshot: session.routine_day_name_snapshot,
          startedAt: session.started_at,
          endedAt: session.ended_at,
          durationSeconds: session.duration_seconds,
          note: session.note,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
          parts: parts
            .filter((part) => part.session_sync_id === entry.sync_id)
            .map((part) => ({
              name: part.body_part_name,
              color: part.body_part_color,
              sortOrder: part.sort_order,
            })),
        },
      };
    });

    result.batch = { datasetId: state.dataset_id, operations };
  });

  if (!result.batch) {
    throw new Error('Workout sync transaction completed without a batch.');
  }
  return result.batch;
}

export async function applyWorkoutSyncResults(
  results: readonly WorkoutSyncServerResult[]
): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const transaction = tx as unknown as SQLite.SQLiteDatabase;
    for (const result of results) {
      if (result.status === 'CONFLICT') {
        if (
          !Number.isSafeInteger(result.serverVersion) ||
          result.serverVersion === undefined ||
          result.serverVersion < result.version
        ) {
          throw new Error('Workout sync conflict response is invalid.');
        }
        const nextVersion = result.serverVersion + 1;
        await transaction.runAsync(
          `UPDATE workout_sessions
           SET sync_version = ?
           WHERE sync_id = ? AND sync_version = ?`,
          nextVersion,
          result.syncId,
          result.version
        );
        await transaction.runAsync(
          `UPDATE workout_sync_outbox
           SET sync_version = ?, attempt_count = 0, last_error = NULL, created_at = ?
           WHERE sync_id = ? AND sync_version = ?`,
          nextVersion,
          new Date().toISOString(),
          result.syncId,
          result.version
        );
        continue;
      }

      await transaction.runAsync(
        `DELETE FROM workout_sync_outbox WHERE sync_id = ? AND sync_version = ?`,
        result.syncId,
        result.version
      );
    }

    const now = new Date().toISOString();
    await transaction.runAsync(
      `UPDATE cloud_backup_state
       SET last_successful_sync_at = ?, last_error = NULL, updated_at = ?
       WHERE id = 1`,
      now,
      now
    );
  });
}

export async function recordWorkoutSyncFailure(error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : 'Workout sync failed.').slice(
    0,
    MAX_SYNC_ERROR_LENGTH
  );
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const now = new Date().toISOString();
    await tx.runAsync(
      `UPDATE cloud_backup_state SET last_error = ?, updated_at = ? WHERE id = 1`,
      message,
      now
    );
    await tx.runAsync(
      `UPDATE workout_sync_outbox
       SET attempt_count = attempt_count + 1, last_error = ?`,
      message
    );
  });
}
