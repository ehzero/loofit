import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMocks = vi.hoisted(() => ({
  getWorkoutBackupLocalState: vi.fn(),
  mergeWorkoutBackup: vi.fn(),
}));
const authMocks = vi.hoisted(() => ({
  getStoredAuthSession: vi.fn(),
  getLoofitAccessToken: vi.fn(),
}));

vi.mock('@/src/db/repository', () => {
  class WorkoutRestoreActiveSessionError extends Error {}
  class WorkoutSyncOwnerMismatchError extends Error {}
  return {
    ...repositoryMocks,
    WorkoutRestoreActiveSessionError,
    WorkoutSyncOwnerMismatchError,
  };
});

vi.mock('@/src/services/auth/native-auth', () => authMocks);

import {
  assertWorkoutBackupUploadAllowed,
  clearWorkoutBackupCompatibilityCache,
  getWorkoutBackupStatus,
  restoreWorkoutBackup,
  WorkoutBackupRestoreRequiredError,
} from './native-workout-backup';

const USER_ID = 'user-1';
const LOCAL_DATASET_ID = 'a'.repeat(32);
const REMOTE_DATASET_ID = 'b'.repeat(32);
const LAST_BACKUP_AT = '2026-08-07T00:00:00.000Z';

const localState = {
  datasetId: LOCAL_DATASET_ID,
  ownerUserId: USER_ID,
  terminalRecordCount: 2,
  pendingOperationCount: 1,
  hasActiveSession: false,
  lastSuccessfulSyncAt: null,
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('native workout backup orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearWorkoutBackupCompatibilityCache();
    authMocks.getStoredAuthSession.mockResolvedValue({ userId: USER_ID });
    authMocks.getLoofitAccessToken.mockResolvedValue('access-token');
    repositoryMocks.getWorkoutBackupLocalState.mockResolvedValue(localState);
    repositoryMocks.mergeWorkoutBackup.mockResolvedValue({
      added: 1,
      updated: 0,
      deleted: 0,
      keptLocal: 1,
      queuedLocal: 1,
    });
  });

  it('reports a different remote dataset as restore available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          exists: true,
          datasetId: REMOTE_DATASET_ID,
          backupRevision: 3,
          lastBackupAt: LAST_BACKUP_AT,
        })
      )
    );

    await expect(getWorkoutBackupStatus()).resolves.toEqual({
      kind: 'restoreAvailable',
      localRecordCount: 2,
      pendingOperationCount: 1,
      hasActiveSession: false,
      lastBackupAt: LAST_BACKUP_AT,
    });
  });

  it('blocks upload before a different remote dataset is explicitly restored', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          exists: true,
          datasetId: REMOTE_DATASET_ID,
          backupRevision: 3,
          lastBackupAt: LAST_BACKUP_AT,
        })
      )
    );

    await expect(
      assertWorkoutBackupUploadAllowed(USER_ID, 'access-token')
    ).rejects.toBeInstanceOf(WorkoutBackupRestoreRequiredError);
  });

  it('downloads a stable backup and applies one local transaction merge', async () => {
    const syncId = 'c'.repeat(32);
    const metadata = {
      exists: true,
      datasetId: REMOTE_DATASET_ID,
      backupRevision: 3,
      lastBackupAt: LAST_BACKUP_AT,
    };
    const operation = {
      type: 'UPSERT',
      syncId,
      version: 2,
      record: {
        status: 'completed',
        routineDayNameSnapshot: 'Push',
        startedAt: '2026-08-06T01:00:00.000Z',
        endedAt: '2026-08-06T02:00:00.000Z',
        durationSeconds: 3_600,
        note: null,
        createdAt: '2026-08-06T01:00:00.000Z',
        updatedAt: '2026-08-06T02:00:00.000Z',
        parts: [{ name: '가슴', color: '#E84A5F', sortOrder: 0 }],
      },
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return url.includes('/records')
        ? jsonResponse({
            datasetId: REMOTE_DATASET_ID,
            backupRevision: 3,
            operations: [operation],
            nextCursor: null,
          })
        : jsonResponse(metadata);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreWorkoutBackup()).resolves.toMatchObject({
      downloaded: 1,
      added: 1,
      queuedLocal: 1,
    });
    expect(repositoryMocks.mergeWorkoutBackup).toHaveBeenCalledWith(
      USER_ID,
      REMOTE_DATASET_ID,
      [operation]
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
