import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';

import {
  WORKOUT_SYNC_ENTITY_TYPES,
  createWorkoutSyncStateItem,
  createWorkoutTombstoneItem,
  createWorkoutRecordItem,
  type WorkoutSyncOperation,
} from './model';
import { WorkoutBackupRepository } from './backup-repository';

const USER_ID = 'user-1';
const DATASET_ID = 'a'.repeat(32);
const SYNC_ID = 'b'.repeat(32);
const NOW = '2026-08-07T00:00:00.000Z';

const operation: Extract<WorkoutSyncOperation, { type: 'UPSERT' }> = {
  type: 'UPSERT',
  syncId: SYNC_ID,
  version: 2,
  record: {
    status: 'completed',
    routineDayNameSnapshot: 'Push',
    startedAt: NOW,
    endedAt: '2026-08-07T01:00:00.000Z',
    durationSeconds: 3_600,
    note: null,
    createdAt: NOW,
    updatedAt: '2026-08-07T01:00:00.000Z',
    parts: [{ name: '가슴', color: '#E84A5F', sortOrder: 0 }],
  },
};

const repository = (send: ReturnType<typeof vi.fn>) =>
  new WorkoutBackupRepository({ client: { send } as never, tableName: 'table' });

describe('workout backup repository', () => {
  it('returns current dataset metadata and supports legacy revision state', async () => {
    const state = createWorkoutSyncStateItem(USER_ID, DATASET_ID, NOW);
    delete (state as { backupRevision?: number }).backupRevision;
    const send = vi.fn().mockResolvedValueOnce({ Item: state });

    await expect(repository(send).getMetadata(USER_ID)).resolves.toEqual({
      exists: true,
      datasetId: DATASET_ID,
      backupRevision: 0,
      lastBackupAt: NOW,
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetCommand);
  });

  it('returns records and tombstones with a consistent paginated query', async () => {
    const tombstoneSyncId = 'c'.repeat(32);
    const send = vi.fn().mockResolvedValueOnce({
      Items: [
        createWorkoutRecordItem(USER_ID, DATASET_ID, operation, NOW),
        createWorkoutTombstoneItem(
          USER_ID,
          DATASET_ID,
          { type: 'DELETE', syncId: tombstoneSyncId, version: 3 },
          NOW
        ),
      ],
      LastEvaluatedKey: {
        pk: `USER#${USER_ID}`,
        sk: `WORKOUT#${tombstoneSyncId}`,
      },
    });

    await expect(repository(send).getPage(USER_ID, SYNC_ID)).resolves.toEqual({
      operations: [
        operation,
        { type: 'DELETE', syncId: tombstoneSyncId, version: 3 },
      ],
      nextSyncId: tombstoneSyncId,
    });
    const query = send.mock.calls[0]?.[0] as QueryCommand;
    expect(query.input.ConsistentRead).toBe(true);
    expect(query.input.ExclusiveStartKey).toEqual({
      pk: `USER#${USER_ID}`,
      sk: `WORKOUT#${SYNC_ID}`,
    });
  });

  it('reports that no server backup state exists', async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    await expect(repository(send).getMetadata(USER_ID)).resolves.toEqual({
      exists: false,
    });
  });
});
