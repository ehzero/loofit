import authConfig from '@/src/config/auth.json';
import {
  getWorkoutBackupLocalState,
  mergeWorkoutBackup,
  WorkoutRestoreActiveSessionError,
  WorkoutSyncOwnerMismatchError,
  type WorkoutBackupMergeResult,
  type WorkoutBackupRecord,
  type WorkoutSyncOperation,
} from '@/src/db/repository';
import { AuthRequiredError } from '@/src/services/auth/auth-service';
import {
  getLoofitAccessToken,
  getStoredAuthSession,
} from '@/src/services/auth/native-auth';

export type RemoteWorkoutBackupMetadata =
  | { exists: false }
  | {
      exists: true;
      datasetId: string;
      backupRevision: number;
      lastBackupAt: string;
    };

export type WorkoutBackupStatus =
  | { kind: 'accountMismatch' }
  | {
      kind: 'noRemoteBackup' | 'connected' | 'restoreAvailable';
      localRecordCount: number;
      pendingOperationCount: number;
      hasActiveSession: boolean;
      lastBackupAt: string | null;
    };

export type WorkoutBackupRestoreResult = WorkoutBackupMergeResult & {
  downloaded: number;
};

export class WorkoutBackupRestoreRequiredError extends Error {
  constructor() {
    super('A different server workout backup must be restored before upload.');
    this.name = 'WorkoutBackupRestoreRequiredError';
  }
}

export class WorkoutBackupNotFoundError extends Error {
  constructor() {
    super('No workout backup is available to restore.');
    this.name = 'WorkoutBackupNotFoundError';
  }
}

export class WorkoutBackupChangedError extends Error {
  constructor() {
    super('The workout backup changed while it was being downloaded.');
    this.name = 'WorkoutBackupChangedError';
  }
}

class WorkoutBackupApiError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'WorkoutBackupApiError';
    this.status = status;
  }
}

type WorkoutBackupPage = {
  datasetId: string;
  backupRevision: number;
  operations: WorkoutSyncOperation[];
  nextCursor: string | null;
};

const DATASET_ID_PATTERN = /^[a-f0-9]{32}$/;
const SYNC_ID_PATTERN = /^[a-f0-9]{32}$/;
const MAX_RESTORE_OPERATIONS = 50_000;
const REQUEST_TIMEOUT_MS = 15_000;
const compatibleDatasets = new Set<string>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

const validNullableTimestamp = (value: unknown): value is string | null =>
  value === null || validTimestamp(value);

const validVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const parseRecord = (value: unknown): WorkoutBackupRecord => {
  if (
    !isRecord(value) ||
    (value.status !== 'completed' && value.status !== 'canceled') ||
    !validTimestamp(value.startedAt) ||
    !validNullableTimestamp(value.endedAt) ||
    !validTimestamp(value.createdAt) ||
    !validTimestamp(value.updatedAt) ||
    !Number.isSafeInteger(value.durationSeconds) ||
    typeof value.durationSeconds !== 'number' ||
    value.durationSeconds < 0 ||
    (value.routineDayNameSnapshot !== null &&
      typeof value.routineDayNameSnapshot !== 'string') ||
    (value.note !== null && typeof value.note !== 'string') ||
    !Array.isArray(value.parts) ||
    value.parts.length === 0 ||
    value.parts.length > 32
  ) {
    throw new WorkoutBackupApiError('Workout backup record was invalid.');
  }
  const parts = value.parts.map((part) => {
    if (
      !isRecord(part) ||
      typeof part.name !== 'string' ||
      part.name.length === 0 ||
      part.name.length > 100 ||
      typeof part.color !== 'string' ||
      !/^#[0-9A-Fa-f]{6}$/.test(part.color) ||
      typeof part.sortOrder !== 'number' ||
      !Number.isSafeInteger(part.sortOrder) ||
      part.sortOrder < 0
    ) {
      throw new WorkoutBackupApiError('Workout backup part was invalid.');
    }
    return {
      name: part.name,
      color: part.color,
      sortOrder: part.sortOrder,
    };
  });
  return {
    status: value.status,
    routineDayNameSnapshot: value.routineDayNameSnapshot,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
    durationSeconds: value.durationSeconds,
    note: value.note,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    parts,
  };
};

const parseMetadata = (value: unknown): RemoteWorkoutBackupMetadata => {
  if (!isRecord(value) || typeof value.exists !== 'boolean') {
    throw new WorkoutBackupApiError('Workout backup metadata was invalid.');
  }
  if (!value.exists) {
    return { exists: false };
  }
  if (
    typeof value.datasetId !== 'string' ||
    !DATASET_ID_PATTERN.test(value.datasetId) ||
    typeof value.backupRevision !== 'number' ||
    !Number.isSafeInteger(value.backupRevision) ||
    value.backupRevision < 0 ||
    !validTimestamp(value.lastBackupAt)
  ) {
    throw new WorkoutBackupApiError('Workout backup metadata was invalid.');
  }
  return {
    exists: true,
    datasetId: value.datasetId,
    backupRevision: value.backupRevision,
    lastBackupAt: value.lastBackupAt,
  };
};

const parsePage = (value: unknown): WorkoutBackupPage => {
  if (
    !isRecord(value) ||
    typeof value.datasetId !== 'string' ||
    !DATASET_ID_PATTERN.test(value.datasetId) ||
    typeof value.backupRevision !== 'number' ||
    !Number.isSafeInteger(value.backupRevision) ||
    value.backupRevision < 0 ||
    !Array.isArray(value.operations) ||
    (value.nextCursor !== null && typeof value.nextCursor !== 'string')
  ) {
    throw new WorkoutBackupApiError('Workout backup page was invalid.');
  }
  const operations = value.operations.map<WorkoutSyncOperation>((operation) => {
    if (
      !isRecord(operation) ||
      typeof operation.syncId !== 'string' ||
      !SYNC_ID_PATTERN.test(operation.syncId) ||
      !validVersion(operation.version)
    ) {
      throw new WorkoutBackupApiError('Workout backup operation was invalid.');
    }
    if (operation.type === 'DELETE') {
      return {
        type: 'DELETE',
        syncId: operation.syncId,
        version: operation.version,
      };
    }
    if (operation.type !== 'UPSERT') {
      throw new WorkoutBackupApiError('Workout backup operation was invalid.');
    }
    return {
      type: 'UPSERT',
      syncId: operation.syncId,
      version: operation.version,
      record: parseRecord(operation.record),
    };
  });
  return {
    datasetId: value.datasetId,
    backupRevision: value.backupRevision,
    operations,
    nextCursor: value.nextCursor,
  };
};

const fetchBackupJson = async (
  accessToken: string,
  path: string
): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${authConfig.apiBaseUrl.replace(/\/$/, '')}${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
  } catch {
    throw new WorkoutBackupApiError('Workout backup request failed.');
  } finally {
    clearTimeout(timeout);
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Successful responses are validated below.
  }
  if (response.status === 401) {
    throw new AuthRequiredError();
  }
  if (response.status === 404) {
    throw new WorkoutBackupNotFoundError();
  }
  if (!response.ok) {
    throw new WorkoutBackupApiError(
      `Workout backup API failed with ${response.status}.`,
      response.status
    );
  }
  return body;
};

export const fetchWorkoutBackupMetadata = async (
  accessToken: string
): Promise<RemoteWorkoutBackupMetadata> =>
  parseMetadata(await fetchBackupJson(accessToken, '/v1/workouts/backup'));

const fetchWorkoutBackupPage = async (
  accessToken: string,
  cursor: string | null
): Promise<WorkoutBackupPage> =>
  parsePage(
    await fetchBackupJson(
      accessToken,
      `/v1/workouts/backup/records${
        cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      }`
    )
  );

const compatibilityKey = (userId: string, datasetId: string): string =>
  `${userId}:${datasetId}`;

export const clearWorkoutBackupCompatibilityCache = (): void => {
  compatibleDatasets.clear();
};

export const assertWorkoutBackupUploadAllowed = async (
  userId: string,
  accessToken: string
): Promise<void> => {
  const local = await getWorkoutBackupLocalState(userId);
  const key = compatibilityKey(userId, local.datasetId);
  if (compatibleDatasets.has(key)) {
    return;
  }
  const remote = await fetchWorkoutBackupMetadata(accessToken);
  if (remote.exists && remote.datasetId !== local.datasetId) {
    throw new WorkoutBackupRestoreRequiredError();
  }
  compatibleDatasets.add(key);
};

export const getWorkoutBackupStatus = async (): Promise<WorkoutBackupStatus> => {
  const session = await getStoredAuthSession();
  if (!session) {
    throw new AuthRequiredError();
  }
  let local;
  try {
    local = await getWorkoutBackupLocalState(session.userId);
  } catch (error) {
    if (error instanceof WorkoutSyncOwnerMismatchError) {
      return { kind: 'accountMismatch' };
    }
    throw error;
  }
  const accessToken = await getLoofitAccessToken();
  const remote = await fetchWorkoutBackupMetadata(accessToken);
  const common = {
    localRecordCount: local.terminalRecordCount,
    pendingOperationCount: local.pendingOperationCount,
    hasActiveSession: local.hasActiveSession,
  };
  if (!remote.exists) {
    return {
      kind: 'noRemoteBackup',
      ...common,
      lastBackupAt: null,
    };
  }
  return {
    kind: remote.datasetId === local.datasetId ? 'connected' : 'restoreAvailable',
    ...common,
    lastBackupAt: remote.lastBackupAt,
  };
};

export const restoreWorkoutBackup = async (): Promise<WorkoutBackupRestoreResult> => {
  const session = await getStoredAuthSession();
  if (!session) {
    throw new AuthRequiredError();
  }
  const local = await getWorkoutBackupLocalState(session.userId);
  if (local.hasActiveSession) {
    throw new WorkoutRestoreActiveSessionError();
  }
  const accessToken = await getLoofitAccessToken();
  const initialMetadata = await fetchWorkoutBackupMetadata(accessToken);
  if (!initialMetadata.exists) {
    throw new WorkoutBackupNotFoundError();
  }

  const operations: WorkoutSyncOperation[] = [];
  const seenSyncIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await fetchWorkoutBackupPage(accessToken, cursor);
    if (
      page.datasetId !== initialMetadata.datasetId ||
      page.backupRevision !== initialMetadata.backupRevision
    ) {
      throw new WorkoutBackupChangedError();
    }
    for (const operation of page.operations) {
      if (seenSyncIds.has(operation.syncId)) {
        throw new WorkoutBackupApiError('Workout backup contained a duplicate record.');
      }
      seenSyncIds.add(operation.syncId);
      operations.push(operation);
      if (operations.length > MAX_RESTORE_OPERATIONS) {
        throw new WorkoutBackupApiError('Workout backup is too large to restore.');
      }
    }
    cursor = page.nextCursor;
    if (cursor !== null) {
      if (seenCursors.has(cursor)) {
        throw new WorkoutBackupApiError('Workout backup cursor repeated.');
      }
      seenCursors.add(cursor);
    }
  } while (cursor !== null);

  const finalMetadata = await fetchWorkoutBackupMetadata(accessToken);
  if (
    !finalMetadata.exists ||
    finalMetadata.datasetId !== initialMetadata.datasetId ||
    finalMetadata.backupRevision !== initialMetadata.backupRevision
  ) {
    throw new WorkoutBackupChangedError();
  }
  const currentSession = await getStoredAuthSession();
  if (!currentSession || currentSession.userId !== session.userId) {
    throw new AuthRequiredError();
  }

  const result = await mergeWorkoutBackup(
    session.userId,
    initialMetadata.datasetId,
    operations
  );
  clearWorkoutBackupCompatibilityCache();
  return {
    ...result,
    downloaded: operations.filter((operation) => operation.type === 'UPSERT')
      .length,
  };
};
