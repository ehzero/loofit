import { create } from 'zustand';

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
import { syncWidgetsFromOverview } from '@/src/widgets/sync';
import type { AppOverview, RoutineTemplate, SessionStatus, StartWorkoutInput } from '@/src/types';

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

async function loadAndSync(): Promise<AppOverview> {
  const overview = await getOverview();
  await syncWidgetsFromOverview(overview).catch((error) => {
    console.warn('[Loofit] Widget sync skipped', error);
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
        const overview = await loadAndSync();
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
      const overview = await loadAndSync();
      set({ overview, isReady: true, error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '새로고침에 실패했어요.' });
    }
  },

  createTemplate: async (template) => runAction(set, async () => createRoutineFromTemplate(template)),
  createCustom: async () => runAction(set, createEmptyRoutine),
  start: async (input) => runAction(set, async () => startWorkout(input)),
  completeActive: async () => runAction(set, completeActiveWorkout),
  cancelActive: async () => runAction(set, cancelActiveWorkout),
  changeActive: async (input) => runAction(set, async () => changeActiveWorkout(input)),
  addPart: async (name) => runAction(set, async () => addBodyPart(name)),
  archivePart: async (id) => runAction(set, async () => archiveBodyPart(id)),
  addDay: async (name, bodyPartIds) => runAction(set, async () => addRoutineDay(name, bodyPartIds)),
  addEmptyDay: async (name) => runAction(set, async () => addEmptyRoutineDay(name)),
  renameDay: async (dayId, name) => runAction(set, async () => renameRoutineDay(dayId, name)),
  setDayParts: async (dayId, bodyPartIds) => runAction(set, async () => setRoutineDayParts(dayId, bodyPartIds)),
  moveDay: async (dayId, direction) => runAction(set, async () => moveRoutineDay(dayId, direction)),
  deleteDay: async (dayId) => runAction(set, async () => deleteRoutineDay(dayId)),
  chooseNextDay: async (routineDayId) => runAction(set, async () => setNextRoutineDay(routineDayId)),
  updateRecord: async (id, updates) => runAction(set, async () => updateSession(id, updates)),
  deleteRecord: async (id) => runAction(set, async () => deleteSession(id)),
  resetDevData: async () => runAction(set, resetAllData),
}));

async function runAction(
  set: (state: Partial<AppState>) => void,
  action: () => Promise<unknown>
): Promise<void> {
  set({ isBusy: true, error: null });
  try {
    await action();
    const overview = await loadAndSync();
    set({ overview, isReady: true, isBusy: false });
  } catch (error) {
    set({
      error: error instanceof Error ? error.message : '작업을 완료하지 못했어요.',
      isBusy: false,
    });
  }
}
