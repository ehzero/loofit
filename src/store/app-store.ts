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
  updateSession,
} from '@/src/db/repository';
import {
  executeAppWorkoutCommand,
  reconcileAppWorkoutSurfaces,
  usesNativeWorkoutPipeline,
} from '@/src/widgets/pipeline';
import type { AppOverview, RoutineTemplate, SessionStatus, StartWorkoutInput } from '@/src/types';
import type { WorkoutCommand } from '@/modules/loofit-workout-core';

let initializationPromise: Promise<void> | null = null;

type AppState = {
  isReady: boolean;
  isBusy: boolean;
  error: string | null;
  overview: AppOverview | null;
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  createTemplate: (template: RoutineTemplate) => Promise<void>;
  start: (input: StartWorkoutInput) => Promise<void>;
  completeActive: () => Promise<void>;
  cancelActive: () => Promise<void>;
  changeActive: (input: StartWorkoutInput) => Promise<void>;
  createCustom: () => Promise<void>;
  addPart: (name: string) => Promise<void>;
  archivePart: (id: number) => Promise<void>;
  addDay: (name: string, bodyPartIds: number[]) => Promise<void>;
  addEmptyDay: (name: string) => Promise<void>;
  renameDay: (dayId: number, name: string) => Promise<void>;
  setDayParts: (dayId: number, bodyPartIds: number[]) => Promise<void>;
  moveDay: (dayId: number, direction: -1 | 1) => Promise<void>;
  deleteDay: (dayId: number) => Promise<void>;
  chooseNextDay: (routineDayId: number | null) => Promise<void>;
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
  ) => Promise<void>;
  deleteRecord: (id: number) => Promise<void>;
  resetDevData: () => Promise<void>;
};

async function loadAndReconcile(): Promise<AppOverview> {
  const overview = await getOverview();
  await reconcileAppWorkoutSurfaces().catch((error) => {
    console.warn(`[${BRAND.displayName}] Workout surface reconcile skipped`, error);
  });
  return overview;
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

    set({ isBusy: true, error: null });
    initializationPromise = (async () => {
      try {
        const overview = await loadAndReconcile();
        set({ overview, isReady: true, isBusy: false });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : '초기화에 실패했어요.',
          isReady: true,
          isBusy: false,
        });
      } finally {
        initializationPromise = null;
      }
    })();

    return initializationPromise;
  },

  refresh: async () => {
    try {
      const overview = await loadAndReconcile();
      set({ overview, isReady: true, error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '새로고침에 실패했어요.' });
    }
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
      completeActiveWorkout
    );
  },
  cancelActive: async () => {
    const sessionId = get().overview?.activeSession?.id;
    return runWorkoutAction(
      set,
      sessionId ? { type: 'cancel', expectedSessionId: sessionId } : null,
      cancelActiveWorkout
    );
  },
  changeActive: async (input) => {
    const sessionId = get().overview?.activeSession?.id;
    return runWorkoutAction(
      set,
      sessionId ? changeCommand(input, sessionId) : null,
      async () => changeActiveWorkout(input)
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
  action: () => Promise<unknown>
): Promise<void> {
  set({ isBusy: true, error: null });
  try {
    await action();
    await reconcileAppWorkoutSurfaces().catch((error) => {
      // The mutation is already committed. Keep the app responsive and leave
      // the dirty revision for the next foreground reconcile to recover.
      console.warn(`[${BRAND.displayName}] Workout surface reconcile deferred`, error);
    });
    const overview = await getOverview();
    set({ overview, isReady: true, isBusy: false });
  } catch (error) {
    set({
      error: error instanceof Error ? error.message : '작업을 완료하지 못했어요.',
      isBusy: false,
    });
  }
}

async function runWorkoutAction(
  set: (state: Partial<AppState>) => void,
  command: WorkoutCommand | null,
  fallback: () => Promise<unknown>
): Promise<void> {
  set({ isBusy: true, error: null });
  try {
    if (usesNativeWorkoutPipeline()) {
      if (command) {
        const result = await executeAppWorkoutCommand(command);
        if (result.status === 'rejected') {
          throw new Error('운동 상태를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.');
        }
      }
    } else {
      await fallback();
    }

    // The native command has already projected the committed state to every
    // surface. Only reload the app cache here; a second reconcile would add
    // latency to the start/end critical path.
    const overview = await getOverview();
    set({ overview, isReady: true, isBusy: false });
  } catch (error) {
    set({
      error: error instanceof Error ? error.message : '작업을 완료하지 못했어요.',
      isBusy: false,
    });
  }
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
