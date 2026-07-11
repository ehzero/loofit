import { create } from 'zustand';

import { BRAND } from '@/src/config/brand';
import {
  addBodyPart,
  addEmptyRoutineDay,
  addRoutineDay,
  archiveBodyPart,
  cancelActiveWorkout,
  changeActiveWorkout,
  completeActiveWorkout,
  createEmptyRoutine,
  createRoutineFromTemplate,
  deleteRoutineDay,
  deleteSession,
  getOverview,
  moveRoutineDay,
  renameRoutineDay,
  resetAllData,
  setNextRoutineDay,
  setRoutineDayParts,
  startWorkout,
  type RepositoryWorkoutResult,
  updateSession,
} from '@/src/db/repository';
import {
  executeAppWorkoutCommand,
  reconcileAppWorkoutSurfaces,
  usesNativeWorkoutPipeline,
} from '@/src/widgets/pipeline';
import type {
  AppOverview,
  RoutineTemplate,
  SessionStatus,
  StartWorkoutInput,
} from '@/src/types';
import type {
  CommandResult,
  CommandStatus,
  PublicationStatus,
  WorkoutCommand,
} from '@/modules/loofit-workout-core';

import {
  AppOperationCoordinator,
  type RefreshTicket,
} from './app-operation-coordinator';

let initializationPromise: Promise<void> | null = null;
let pendingBusyOperations = 0;
const operationCoordinator = new AppOperationCoordinator();

export type AppActionStatus = CommandStatus | 'error';
export type OverviewStatus = 'refreshed' | 'superseded' | 'failed';

export type AppActionResult = {
  status: AppActionStatus;
  sessionId: number | null;
  desiredRevision: number;
  publishedRevision: number;
  publicationStatus: PublicationStatus;
  publicationError: string | null;
  overviewStatus: OverviewStatus;
  error: string | null;
};

type AppState = {
  isReady: boolean;
  isBusy: boolean;
  error: string | null;
  overview: AppOverview | null;
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  createTemplate: (template: RoutineTemplate) => Promise<AppActionResult>;
  start: (input: StartWorkoutInput) => Promise<AppActionResult>;
  completeActive: () => Promise<AppActionResult>;
  cancelActive: () => Promise<AppActionResult>;
  changeActive: (input: StartWorkoutInput) => Promise<AppActionResult>;
  createCustom: () => Promise<AppActionResult>;
  addPart: (name: string) => Promise<AppActionResult>;
  archivePart: (id: number) => Promise<AppActionResult>;
  addDay: (name: string, bodyPartIds: number[]) => Promise<AppActionResult>;
  addEmptyDay: (name: string) => Promise<AppActionResult>;
  renameDay: (dayId: number, name: string) => Promise<AppActionResult>;
  setDayParts: (dayId: number, bodyPartIds: number[]) => Promise<AppActionResult>;
  moveDay: (dayId: number, direction: -1 | 1) => Promise<AppActionResult>;
  deleteDay: (dayId: number) => Promise<AppActionResult>;
  chooseNextDay: (routineDayId: number | null) => Promise<AppActionResult>;
  updateRecord: (
    id: number,
    updates: {
      status?: SessionStatus;
      startedAt?: string;
      endedAt?: string | null;
      note?: string | null;
      routineDayId?: number | null;
      bodyPartIds?: number[];
    }
  ) => Promise<AppActionResult>;
  deleteRecord: (id: number) => Promise<AppActionResult>;
  resetDevData: () => Promise<AppActionResult>;
};

export function isActionSuccessful(result: AppActionResult): boolean {
  return result.status === 'applied' && result.overviewStatus !== 'failed';
}

export function shouldDismissAfterAction(result: AppActionResult): boolean {
  return (
    result.overviewStatus !== 'failed' &&
    (result.status === 'applied' || result.status === 'noop' || result.status === 'stale')
  );
}

export const useAppStore = create<AppState>((set, get) => ({
  isReady: false,
  isBusy: false,
  error: null,
  overview: null,

  initialize: async () => {
    if (get().isReady) {
      return;
    }
    if (initializationPromise) {
      return initializationPromise;
    }

    const ticket = operationCoordinator.beginRefresh();
    beginBusyOperation(set);
    initializationPromise = runRefreshAction(set, ticket, '초기화에 실패했어요.').finally(
      () => {
        finishBusyOperation(set);
        initializationPromise = null;
      }
    );

    return initializationPromise;
  },

  refresh: async () => {
    set({ error: null });
    const ticket = operationCoordinator.beginRefresh();
    await runRefreshAction(set, ticket, '새로고침에 실패했어요.');
  },

  createTemplate: async (template) =>
    runMutationAction(set, async () => createRoutineFromTemplate(template)),
  createCustom: async () => runMutationAction(set, createEmptyRoutine),
  start: async (input) =>
    runWorkoutAction(set, startCommand(input), async () => startWorkout(input)),
  completeActive: async () => {
    const sessionId = get().overview?.activeSession?.id;
    return runWorkoutAction(
      set,
      sessionId ? { type: 'complete', expectedSessionId: sessionId } : null,
      sessionId
        ? async () => completeActiveWorkout(sessionId)
        : async () => ({ status: 'noop', session: null })
    );
  },
  cancelActive: async () => {
    const sessionId = get().overview?.activeSession?.id;
    return runWorkoutAction(
      set,
      sessionId ? { type: 'cancel', expectedSessionId: sessionId } : null,
      sessionId
        ? async () => cancelActiveWorkout(sessionId)
        : async () => ({ status: 'noop', session: null })
    );
  },
  changeActive: async (input) => {
    const sessionId = get().overview?.activeSession?.id;
    return runWorkoutAction(
      set,
      sessionId ? changeCommand(input, sessionId) : null,
      sessionId
        ? async () => changeActiveWorkout(sessionId, input)
        : async () => ({ status: 'stale', session: null })
    );
  },
  addPart: async (name) => runMutationAction(set, async () => addBodyPart(name)),
  archivePart: async (id) => runMutationAction(set, async () => archiveBodyPart(id)),
  addDay: async (name, bodyPartIds) =>
    runMutationAction(set, async () => addRoutineDay(name, bodyPartIds)),
  addEmptyDay: async (name) => runMutationAction(set, async () => addEmptyRoutineDay(name)),
  renameDay: async (dayId, name) =>
    runMutationAction(set, async () => renameRoutineDay(dayId, name)),
  setDayParts: async (dayId, bodyPartIds) =>
    runMutationAction(set, async () => setRoutineDayParts(dayId, bodyPartIds)),
  moveDay: async (dayId, direction) =>
    runMutationAction(set, async () => moveRoutineDay(dayId, direction)),
  deleteDay: async (dayId) => runMutationAction(set, async () => deleteRoutineDay(dayId)),
  chooseNextDay: async (routineDayId) =>
    runMutationAction(set, async () => setNextRoutineDay(routineDayId)),
  updateRecord: async (id, updates) =>
    runMutationAction(set, async () => updateSession(id, updates)),
  deleteRecord: async (id) => runMutationAction(set, async () => deleteSession(id)),
  resetDevData: async () => runMutationAction(set, resetAllData),
}));

async function runMutationAction(
  set: (state: Partial<AppState>) => void,
  action: () => Promise<boolean>
): Promise<AppActionResult> {
  operationCoordinator.beginMutation();
  beginBusyOperation(set);

  return operationCoordinator
    .runInPipeline(async () => {
      let result = localCommandResult('applied');
      let actionError: string | null = null;

      try {
        const applied = await action();
        result = localCommandResult(applied ? 'applied' : 'noop');
      } catch (error) {
        actionError = errorMessage(error, '작업을 완료하지 못했어요.');
        result = localCommandResult('error');
      }

      if (result.status === 'applied') {
        try {
          const publication = await reconcileAppWorkoutSurfaces();
          result = publication
            ? combineMutationAndPublication(result, publication)
            : { ...result, publicationStatus: 'skipped' };
        } catch (error) {
          const publicationError = errorMessage(error, '위젯 반영을 완료하지 못했어요.');
          console.warn(`[${BRAND.displayName}] Workout surface reconcile deferred`, error);
          result = {
            ...result,
            publicationStatus: 'pending',
            publicationError,
          };
        }
      }

      return refreshOverviewAfterAction(set, result, actionError);
    })
    .finally(() => finishBusyOperation(set));
}

async function runWorkoutAction(
  set: (state: Partial<AppState>) => void,
  command: WorkoutCommand | null,
  fallback: () => Promise<RepositoryWorkoutResult>
): Promise<AppActionResult> {
  operationCoordinator.beginMutation();
  beginBusyOperation(set);

  return operationCoordinator
    .runInPipeline(async () => {
      let result: AppActionResult;
      let actionError: string | null = null;

      try {
        if (!command) {
          result = localCommandResult('noop');
        } else if (usesNativeWorkoutPipeline()) {
          result = commandResultToAppResult(await executeAppWorkoutCommand(command));
        } else {
          result = fallbackCommandResult(await fallback());
        }

        if (result.status === 'rejected') {
          actionError = '운동 상태를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.';
        }
      } catch (error) {
        actionError = errorMessage(error, '작업을 완료하지 못했어요.');
        result = localCommandResult('error');
      }

      // Native workout commands already publish the committed revision. The
      // app cache is deliberately the only read performed after that command.
      return refreshOverviewAfterAction(set, result, actionError);
    })
    .finally(() => finishBusyOperation(set));
}

async function runRefreshAction(
  set: (state: Partial<AppState>) => void,
  ticket: RefreshTicket,
  failureMessage: string
): Promise<void> {
  await operationCoordinator.waitForPipeline();

  try {
    const overview = await getOverview();
    if (!operationCoordinator.acceptRefreshSuccess(ticket)) {
      return;
    }
    set({ overview, isReady: true, error: null });
  } catch (error) {
    if (operationCoordinator.isCurrent(ticket)) {
      set({ error: errorMessage(error, failureMessage), isReady: true });
    }
    return;
  }

  // Reconciliation shares the mutation pipeline so an older foreground pass
  // cannot overwrite a snapshot produced by a newer workout command.
  await operationCoordinator.runInPipeline(async () => {
    if (!operationCoordinator.isLatestSuccessfulRefresh(ticket)) {
      return;
    }
    try {
      const result = await reconcileAppWorkoutSurfaces();
      if (result?.publicationStatus === 'pending') {
        console.warn(
          `[${BRAND.displayName}] Workout surface reconcile remains pending`,
          result.publicationError
        );
      }
    } catch (error) {
      console.warn(`[${BRAND.displayName}] Workout surface reconcile skipped`, error);
    }
  });
}

async function refreshOverviewAfterAction(
  set: (state: Partial<AppState>) => void,
  result: AppActionResult,
  actionError: string | null
): Promise<AppActionResult> {
  let overview: AppOverview;

  try {
    overview = await getOverview();
  } catch (error) {
    const overviewError =
      actionError ??
      (result.status === 'applied'
        ? '작업은 저장됐지만 화면을 새로고침하지 못했어요.'
        : errorMessage(error, '최신 운동 상태를 불러오지 못했어요.'));
    set({ error: overviewError, isReady: true });
    return { ...result, overviewStatus: 'failed', error: overviewError };
  }

  set({ overview, isReady: true, error: actionError });
  return { ...result, overviewStatus: 'refreshed', error: actionError };
}

function localCommandResult(status: AppActionStatus): AppActionResult {
  return {
    status,
    sessionId: null,
    desiredRevision: 0,
    publishedRevision: 0,
    publicationStatus: 'skipped',
    publicationError: null,
    overviewStatus: 'superseded',
    error: null,
  };
}

function commandResultToAppResult(result: CommandResult): AppActionResult {
  return {
    ...result,
    overviewStatus: 'superseded',
    error: null,
  };
}

function combineMutationAndPublication(
  mutation: AppActionResult,
  publication: CommandResult
): AppActionResult {
  return {
    ...mutation,
    sessionId: publication.sessionId,
    desiredRevision: publication.desiredRevision,
    publishedRevision: publication.publishedRevision,
    publicationStatus: publication.publicationStatus,
    publicationError: publication.publicationError,
  };
}

function fallbackCommandResult(
  result: RepositoryWorkoutResult
): AppActionResult {
  return {
    ...localCommandResult(result.status),
    sessionId: result.session?.id ?? null,
  };
}

function beginBusyOperation(set: (state: Partial<AppState>) => void): void {
  pendingBusyOperations += 1;
  set({ isBusy: true, error: null });
}

function finishBusyOperation(set: (state: Partial<AppState>) => void): void {
  pendingBusyOperations = Math.max(0, pendingBusyOperations - 1);
  if (pendingBusyOperations === 0) {
    set({ isBusy: false });
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function startCommand(input: StartWorkoutInput): WorkoutCommand {
  return input.kind === 'routine'
    ? { type: 'startRoutine', routineDayId: input.routineDayId }
    : { type: 'startFree', bodyPartIds: input.bodyPartIds, label: input.label };
}

function changeCommand(input: StartWorkoutInput, expectedSessionId: number): WorkoutCommand {
  return input.kind === 'routine'
    ? { type: 'changeRoutine', expectedSessionId, routineDayId: input.routineDayId }
    : { type: 'changeFree', expectedSessionId, bodyPartIds: input.bodyPartIds };
}
