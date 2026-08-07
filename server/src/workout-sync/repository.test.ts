import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';

import {
  WORKOUT_SYNC_ENTITY_TYPES,
  createWorkoutSyncStateItem,
  type WorkoutSyncOperation,
} from './model';
import {
  WorkoutSyncDatasetMismatchError,
  WorkoutSyncRepository,
} from './repository';

const NOW = new Date('2026-08-07T00:00:00.000Z');
const USER_ID = 'user-1';
const DATASET_ID = 'a'.repeat(32);
const SYNC_ID = 'b'.repeat(32);

const operation: WorkoutSyncOperation = {
  type: 'UPSERT',
  syncId: SYNC_ID,
  version: 1,
  record: {
    status: 'completed',
    routineDayNameSnapshot: 'Push',
    startedAt: '2026-08-07T01:00:00.000Z',
    endedAt: '2026-08-07T02:00:00.000Z',
    durationSeconds: 3_600,
    note: null,
    createdAt: '2026-08-07T01:00:00.000Z',
    updatedAt: '2026-08-07T02:00:00.000Z',
    parts: [{ name: '가슴', color: '#E84A5F', sortOrder: 0 }],
  },
};

const conditionalFailure = () =>
  Object.assign(new Error('conditional failure'), {
    name: 'ConditionalCheckFailedException',
  });

const repository = (send: ReturnType<typeof vi.fn>) =>
  new WorkoutSyncRepository({
    client: { send } as never,
    tableName: 'loofit-production-user-data',
    now: () => NOW,
  });

describe('workout sync repository', () => {
  it('binds the first dataset and stores the complete workout record', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await expect(
      repository(send).synchronize(USER_ID, DATASET_ID, [operation])
    ).resolves.toEqual([
      { syncId: SYNC_ID, version: 1, status: 'APPLIED' },
    ]);

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetCommand);
    const statePut = send.mock.calls[1]?.[0] as PutCommand;
    expect(statePut.input.Item).toMatchObject({
      entityType: WORKOUT_SYNC_ENTITY_TYPES.state,
      datasetId: DATASET_ID,
    });
    const workoutPut = send.mock.calls[2]?.[0] as PutCommand;
    expect(workoutPut.input.Item).toMatchObject({
      entityType: WORKOUT_SYNC_ENTITY_TYPES.record,
      syncId: SYNC_ID,
      syncVersion: 1,
      record: operation.record,
    });
    expect(workoutPut.input.ConditionExpression).toContain(
      'syncVersion < :incomingVersion'
    );
    const stateUpdate = send.mock.calls[3]?.[0] as UpdateCommand;
    expect(stateUpdate.input.UpdateExpression).toContain('backupRevision');
    expect(stateUpdate.input.ConditionExpression).toBe('datasetId = :datasetId');
  });

  it('treats the same stored version as an idempotent retry', async () => {
    const state = createWorkoutSyncStateItem(USER_ID, DATASET_ID, NOW.toISOString());
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Item: state })
      .mockRejectedValueOnce(conditionalFailure())
      .mockResolvedValueOnce({ Item: { syncVersion: 1 } })
      .mockResolvedValueOnce({});

    await expect(
      repository(send).synchronize(USER_ID, DATASET_ID, [operation])
    ).resolves.toEqual([
      { syncId: SYNC_ID, version: 1, status: 'ALREADY_APPLIED' },
    ]);
  });

  it('reports a newer server revision so the local SSOT can advance and retry', async () => {
    const state = createWorkoutSyncStateItem(USER_ID, DATASET_ID, NOW.toISOString());
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Item: state })
      .mockRejectedValueOnce(conditionalFailure())
      .mockResolvedValueOnce({ Item: { syncVersion: 4 } })
      .mockResolvedValueOnce({});

    await expect(
      repository(send).synchronize(USER_ID, DATASET_ID, [operation])
    ).resolves.toEqual([
      {
        syncId: SYNC_ID,
        version: 1,
        status: 'CONFLICT',
        serverVersion: 4,
      },
    ]);
  });

  it('does not accept another local dataset for an already bound user', async () => {
    const state = createWorkoutSyncStateItem(
      USER_ID,
      'c'.repeat(32),
      NOW.toISOString()
    );
    const send = vi.fn().mockResolvedValueOnce({ Item: state });

    await expect(
      repository(send).synchronize(USER_ID, DATASET_ID, [operation])
    ).rejects.toBeInstanceOf(WorkoutSyncDatasetMismatchError);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
