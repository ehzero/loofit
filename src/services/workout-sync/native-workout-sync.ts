import { AppState } from 'react-native';

import {
  applyWorkoutSyncResults,
  prepareWorkoutSyncBatch,
  recordWorkoutSyncFailure,
  WorkoutSyncOwnerMismatchError,
  type WorkoutSyncBatch,
  type WorkoutSyncServerResult,
} from '@/src/db/repository';
import authConfig from '@/src/config/auth.json';
import {
  getLoofitAccessToken,
  getStoredAuthSession,
} from '@/src/services/auth/native-auth';
import { AuthRequiredError } from '@/src/services/auth/auth-service';
import {
  assertWorkoutBackupUploadAllowed,
  clearWorkoutBackupCompatibilityCache,
  WorkoutBackupRestoreRequiredError,
} from '@/src/services/workout-sync/native-workout-backup';

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000, 300_000] as const;
const MAX_BATCHES_PER_RUN = 20;

class WorkoutSyncApiError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'WorkoutSyncApiError';
    this.retryable = retryable;
  }
}

class WorkoutSyncDatasetMismatchError extends Error {
  constructor() {
    super('The server workout backup belongs to another local dataset.');
    this.name = 'WorkoutSyncDatasetMismatchError';
  }
}

let syncInFlight: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;
let syncRequestedWhileInFlight = false;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseErrorCode = (value: unknown): string | null =>
  isRecord(value) &&
  isRecord(value.error) &&
  typeof value.error.code === 'string'
    ? value.error.code
    : null;

const parseResults = (
  value: unknown,
  batch: WorkoutSyncBatch
): WorkoutSyncServerResult[] => {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    throw new WorkoutSyncApiError('Workout sync response was invalid.', true);
  }
  const expected = new Map(
    batch.operations.map((operation) => [
      operation.syncId,
      operation.version,
    ])
  );
  const seen = new Set<string>();
  const results = value.results.map<WorkoutSyncServerResult>((result) => {
    if (
      !isRecord(result) ||
      typeof result.syncId !== 'string' ||
      typeof result.version !== 'number' ||
      !Number.isSafeInteger(result.version) ||
      seen.has(result.syncId) ||
      expected.get(result.syncId) !== result.version ||
      (result.status !== 'APPLIED' &&
        result.status !== 'ALREADY_APPLIED' &&
        result.status !== 'CONFLICT')
    ) {
      throw new WorkoutSyncApiError('Workout sync response was invalid.', true);
    }
    seen.add(result.syncId);
    if (result.status === 'CONFLICT') {
      if (
        typeof result.serverVersion !== 'number' ||
        !Number.isSafeInteger(result.serverVersion) ||
        result.serverVersion < result.version
      ) {
        throw new WorkoutSyncApiError('Workout sync conflict was invalid.', true);
      }
      return {
        syncId: result.syncId,
        version: result.version,
        status: result.status,
        serverVersion: result.serverVersion,
      };
    }
    return {
      syncId: result.syncId,
      version: result.version,
      status: result.status,
    };
  });
  if (results.length !== expected.size) {
    throw new WorkoutSyncApiError('Workout sync response was incomplete.', true);
  }
  return results;
};

const sendBatch = async (
  accessToken: string,
  batch: WorkoutSyncBatch
): Promise<WorkoutSyncServerResult[]> => {
  let response: Response;
  try {
    response = await fetch(
      `${authConfig.apiBaseUrl.replace(/\/$/, '')}/v1/workouts/sync`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(batch),
      }
    );
  } catch {
    throw new WorkoutSyncApiError('Workout sync network request failed.', true);
  }

  let responseBody: unknown = null;
  try {
    responseBody = await response.json();
  } catch {
    // Successful responses are validated below; errors can omit JSON bodies.
  }
  if (!response.ok) {
    const code = parseErrorCode(responseBody);
    if (response.status === 409 && code === 'WORKOUT_SYNC_DATASET_MISMATCH') {
      throw new WorkoutSyncDatasetMismatchError();
    }
    throw new WorkoutSyncApiError(
      `Workout sync API failed with ${code ?? response.status}.`,
      response.status === 429 || response.status >= 500
    );
  }
  return parseResults(responseBody, batch);
};

const clearRetryTimer = (): void => {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
};

const scheduleRetry = (): void => {
  if (AppState.currentState !== 'active' || retryTimer !== null) {
    return;
  }
  const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
  retryAttempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    triggerWorkoutSync();
  }, delay);
};

const runWorkoutSync = async (): Promise<void> => {
  const session = await getStoredAuthSession();
  if (!session || AppState.currentState !== 'active') {
    return;
  }

  const initialAccessToken = await getLoofitAccessToken();
  await assertWorkoutBackupUploadAllowed(session.userId, initialAccessToken);

  for (let batchIndex = 0; batchIndex < MAX_BATCHES_PER_RUN; batchIndex += 1) {
    if (AppState.currentState !== 'active') {
      return;
    }
    const batch = await prepareWorkoutSyncBatch(session.userId);
    if (batch.operations.length === 0) {
      retryAttempt = 0;
      clearRetryTimer();
      return;
    }
    const accessToken =
      batchIndex === 0 ? initialAccessToken : await getLoofitAccessToken();
    const results = await sendBatch(accessToken, batch);
    await applyWorkoutSyncResults(results);
    retryAttempt = 0;
  }

  setTimeout(triggerWorkoutSync, 0);
};

export const triggerWorkoutSync = (delayMs = 0): void => {
  if (AppState.currentState !== 'active') {
    return;
  }
  if (delayMs > 0) {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      triggerWorkoutSync();
    }, delayMs);
    return;
  }
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (syncInFlight !== null) {
    syncRequestedWhileInFlight = true;
    return;
  }
  clearRetryTimer();
  syncInFlight = runWorkoutSync()
    .catch(async (error: unknown) => {
      if (error instanceof AuthRequiredError) {
        return;
      }
      try {
        await recordWorkoutSyncFailure(error);
      } catch (stateError) {
        console.warn('[루핏] 운동 기록 동기화 오류 상태를 저장하지 못했어요.', stateError);
      }
      if (
        error instanceof WorkoutSyncOwnerMismatchError ||
        error instanceof WorkoutBackupRestoreRequiredError ||
        error instanceof WorkoutSyncDatasetMismatchError ||
        (error instanceof WorkoutSyncApiError && !error.retryable)
      ) {
        if (error instanceof WorkoutSyncDatasetMismatchError) {
          clearWorkoutBackupCompatibilityCache();
        }
        return;
      }
      scheduleRetry();
    })
    .finally(() => {
      syncInFlight = null;
      if (syncRequestedWhileInFlight) {
        syncRequestedWhileInFlight = false;
        setTimeout(triggerWorkoutSync, 0);
      }
    });
};

export const pauseWorkoutSyncRetries = (): void => {
  clearRetryTimer();
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
};
