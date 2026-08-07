export const WORKOUT_SYNC_ENTITY_TYPES = {
  state: 'WORKOUT_SYNC_STATE',
  record: 'WORKOUT_RECORD',
  tombstone: 'WORKOUT_TOMBSTONE',
} as const;

export type WorkoutSyncPart = {
  name: string;
  color: string;
  sortOrder: number;
};

export type WorkoutSyncRecord = {
  status: 'completed' | 'canceled';
  routineDayNameSnapshot: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  parts: WorkoutSyncPart[];
};

export type WorkoutSyncOperation =
  | {
      type: 'UPSERT';
      syncId: string;
      version: number;
      record: WorkoutSyncRecord;
    }
  | {
      type: 'DELETE';
      syncId: string;
      version: number;
    };

export type WorkoutSyncResult = {
  syncId: string;
  version: number;
  status: 'APPLIED' | 'ALREADY_APPLIED' | 'CONFLICT';
  serverVersion?: number;
};

export const workoutSyncStateKey = (userId: string) => ({
  pk: `USER#${userId}`,
  sk: 'BACKUP#WORKOUTS',
});

export const workoutRecordKey = (userId: string, syncId: string) => ({
  pk: `USER#${userId}`,
  sk: `WORKOUT#${syncId}`,
});

export const createWorkoutSyncStateItem = (
  userId: string,
  datasetId: string,
  now: string
) => ({
  ...workoutSyncStateKey(userId),
  entityType: WORKOUT_SYNC_ENTITY_TYPES.state,
  userId,
  datasetId,
  backupRevision: 0,
  createdAt: now,
  updatedAt: now,
});

export const createWorkoutRecordItem = (
  userId: string,
  datasetId: string,
  operation: Extract<WorkoutSyncOperation, { type: 'UPSERT' }>,
  now: string
) => ({
  ...workoutRecordKey(userId, operation.syncId),
  entityType: WORKOUT_SYNC_ENTITY_TYPES.record,
  userId,
  datasetId,
  syncId: operation.syncId,
  syncVersion: operation.version,
  record: operation.record,
  updatedAt: now,
});

export const createWorkoutTombstoneItem = (
  userId: string,
  datasetId: string,
  operation: Extract<WorkoutSyncOperation, { type: 'DELETE' }>,
  now: string
) => ({
  ...workoutRecordKey(userId, operation.syncId),
  entityType: WORKOUT_SYNC_ENTITY_TYPES.tombstone,
  userId,
  datasetId,
  syncId: operation.syncId,
  syncVersion: operation.version,
  deletedAt: now,
  updatedAt: now,
});
