import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppOverview } from '@/src/types';

const repositoryMocks = vi.hoisted(() => ({
  createRoutineFromTemplate: vi.fn(),
  getOverview: vi.fn(),
  startWorkout: vi.fn(),
  completeActiveWorkout: vi.fn(),
  cancelActiveWorkout: vi.fn(),
  changeActiveWorkout: vi.fn(),
}));

const pipelineMocks = vi.hoisted(() => ({
  executeAppWorkoutCommand: vi.fn(),
  reconcileAppWorkoutSurfaces: vi.fn(),
  usesNativeWorkoutPipeline: vi.fn(),
}));

vi.mock('@/src/db/repository', () => ({
  addBodyPart: vi.fn(),
  addEmptyRoutineDay: vi.fn(),
  addRoutineDay: vi.fn(),
  archiveBodyPart: vi.fn(),
  cancelActiveWorkout: repositoryMocks.cancelActiveWorkout,
  changeActiveWorkout: repositoryMocks.changeActiveWorkout,
  completeActiveWorkout: repositoryMocks.completeActiveWorkout,
  createEmptyRoutine: vi.fn(),
  createRoutineFromTemplate: repositoryMocks.createRoutineFromTemplate,
  deleteRoutineDay: vi.fn(),
  deleteSession: vi.fn(),
  getOverview: repositoryMocks.getOverview,
  moveRoutineDay: vi.fn(),
  renameRoutineDay: vi.fn(),
  resetAllData: vi.fn(),
  setNextRoutineDay: vi.fn(),
  setRoutineDayParts: vi.fn(),
  startWorkout: repositoryMocks.startWorkout,
  updateSession: vi.fn(),
}));

vi.mock('@/src/widgets/pipeline', () => pipelineMocks);

import { useAppStore } from './app-store';

const commandResult = {
  status: 'applied' as const,
  sessionId: 42,
  desiredRevision: 2,
  publishedRevision: 2,
};

describe('app workout pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pipelineMocks.usesNativeWorkoutPipeline.mockReturnValue(true);
    pipelineMocks.executeAppWorkoutCommand.mockResolvedValue(commandResult);
    pipelineMocks.reconcileAppWorkoutSurfaces.mockResolvedValue(commandResult);
    repositoryMocks.getOverview.mockResolvedValue(overviewWithSession(null));
    useAppStore.setState({
      isReady: true,
      isBusy: false,
      error: null,
      overview: overviewWithSession(null),
    });
  });

  it('uses the native command and only refreshes the overview on iOS start', async () => {
    await useAppStore.getState().start({ kind: 'routine', routineDayId: 7 });

    expect(pipelineMocks.executeAppWorkoutCommand).toHaveBeenCalledWith({
      type: 'startRoutine',
      routineDayId: 7,
    });
    expect(repositoryMocks.startWorkout).not.toHaveBeenCalled();
    expect(pipelineMocks.reconcileAppWorkoutSurfaces).not.toHaveBeenCalled();
    expect(repositoryMocks.getOverview).toHaveBeenCalledTimes(1);
  });

  it('guards completion with the active session id', async () => {
    useAppStore.setState({ overview: overviewWithSession(42) });

    await useAppStore.getState().completeActive();

    expect(pipelineMocks.executeAppWorkoutCommand).toHaveBeenCalledWith({
      type: 'complete',
      expectedSessionId: 42,
    });
    expect(repositoryMocks.completeActiveWorkout).not.toHaveBeenCalled();
  });

  it('reconciles routine mutations before refreshing the overview', async () => {
    await useAppStore.getState().createTemplate('ppl');

    expect(repositoryMocks.createRoutineFromTemplate).toHaveBeenCalledWith('ppl');
    expect(pipelineMocks.reconcileAppWorkoutSurfaces).toHaveBeenCalledTimes(1);
    expect(repositoryMocks.getOverview).toHaveBeenCalledTimes(1);
    expect(
      pipelineMocks.reconcileAppWorkoutSurfaces.mock.invocationCallOrder[0]
    ).toBeLessThan(repositoryMocks.getOverview.mock.invocationCallOrder[0]);
  });

  it('retains the repository fallback outside iOS', async () => {
    pipelineMocks.usesNativeWorkoutPipeline.mockReturnValue(false);

    await useAppStore.getState().start({ kind: 'free', bodyPartIds: [3] });

    expect(repositoryMocks.startWorkout).toHaveBeenCalledWith({
      kind: 'free',
      bodyPartIds: [3],
    });
    expect(pipelineMocks.executeAppWorkoutCommand).not.toHaveBeenCalled();
  });
});

function overviewWithSession(sessionId: number | null): AppOverview {
  return {
    activeSession: sessionId === null ? null : { id: sessionId },
  } as AppOverview;
}
