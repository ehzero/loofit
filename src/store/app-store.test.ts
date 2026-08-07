import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandResult } from '@/modules/loofit-workout-core';
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

const workoutSyncMocks = vi.hoisted(() => ({
  requestWorkoutSync: vi.fn(),
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
vi.mock(
  '@/src/services/workout-sync/workout-sync-events',
  () => workoutSyncMocks
);

import { useAppStore } from './app-store';

const commandResult: CommandResult = {
  status: 'applied',
  sessionId: 42,
  desiredRevision: 2,
  publishedRevision: 2,
  publicationStatus: 'published',
  publicationError: null,
};

describe('app workout pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pipelineMocks.usesNativeWorkoutPipeline.mockReturnValue(true);
    pipelineMocks.executeAppWorkoutCommand.mockResolvedValue(commandResult);
    pipelineMocks.reconcileAppWorkoutSurfaces.mockResolvedValue(commandResult);
    repositoryMocks.createRoutineFromTemplate.mockResolvedValue(true);
    repositoryMocks.getOverview.mockResolvedValue(overviewWithSession(null));
    useAppStore.setState({
      isReady: true,
      isBusy: false,
      error: null,
      overview: overviewWithSession(null),
    });
  });

  it('returns the native mutation and publication result, then refreshes only the app overview', async () => {
    const result = await useAppStore.getState().start({ kind: 'routine', routineDayId: 7 });

    expect(pipelineMocks.executeAppWorkoutCommand).toHaveBeenCalledWith({
      type: 'startRoutine',
      routineDayId: 7,
    });
    expect(repositoryMocks.startWorkout).not.toHaveBeenCalled();
    expect(pipelineMocks.reconcileAppWorkoutSurfaces).not.toHaveBeenCalled();
    expect(repositoryMocks.getOverview).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'applied',
      publicationStatus: 'published',
      overviewStatus: 'refreshed',
      sessionId: 42,
    });
    expect(workoutSyncMocks.requestWorkoutSync).not.toHaveBeenCalled();
  });

  it('guards completion with the active session id', async () => {
    useAppStore.setState({ overview: overviewWithSession(42) });

    await useAppStore.getState().completeActive();

    expect(pipelineMocks.executeAppWorkoutCommand).toHaveBeenCalledWith({
      type: 'complete',
      expectedSessionId: 42,
    });
    expect(repositoryMocks.completeActiveWorkout).not.toHaveBeenCalled();
    expect(workoutSyncMocks.requestWorkoutSync).toHaveBeenCalledWith(1_500);
  });

  it('sends the selected workout edit scope with the active session id', async () => {
    useAppStore.setState({ overview: overviewWithSession(42) });

    await useAppStore
      .getState()
      .changeActive({ bodyPartIds: [3], updateRoutine: true });

    expect(pipelineMocks.executeAppWorkoutCommand).toHaveBeenCalledWith({
      type: 'changeParts',
      expectedSessionId: 42,
      bodyPartIds: [3],
      updateRoutine: true,
    });
    expect(repositoryMocks.changeActiveWorkout).not.toHaveBeenCalled();
    expect(workoutSyncMocks.requestWorkoutSync).not.toHaveBeenCalled();
  });

  it('treats a committed command with deferred publication as applied and rereads the database', async () => {
    pipelineMocks.executeAppWorkoutCommand.mockResolvedValue({
      ...commandResult,
      desiredRevision: 3,
      publishedRevision: 2,
      publicationStatus: 'pending',
      publicationError: 'snapshot write failed',
    });
    const refreshed = overviewWithSession(42);
    repositoryMocks.getOverview.mockResolvedValue(refreshed);

    const result = await useAppStore.getState().start({ kind: 'routine', routineDayId: 7 });

    expect(result).toMatchObject({
      status: 'applied',
      publicationStatus: 'pending',
      publicationError: 'snapshot write failed',
      overviewStatus: 'refreshed',
    });
    expect(useAppStore.getState().overview).toBe(refreshed);
    expect(useAppStore.getState().error).toBeNull();
  });

  it.each(['noop', 'stale', 'rejected'] as const)(
    'rereads the overview after a %s native result',
    async (status) => {
      pipelineMocks.executeAppWorkoutCommand.mockResolvedValue({
        ...commandResult,
        status,
      });

      const result = await useAppStore.getState().start({ kind: 'routine', routineDayId: 7 });

      expect(repositoryMocks.getOverview).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(status);
      expect(result.overviewStatus).toBe('refreshed');
      expect(useAppStore.getState().error === null).toBe(status !== 'rejected');
    }
  );

  it('rereads the overview and exposes an error when a native command throws', async () => {
    pipelineMocks.executeAppWorkoutCommand.mockRejectedValue(new Error('database is locked'));
    const refreshed = overviewWithSession(42);
    repositoryMocks.getOverview.mockResolvedValue(refreshed);

    const result = await useAppStore.getState().start({ kind: 'routine', routineDayId: 7 });

    expect(repositoryMocks.getOverview).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'error',
      overviewStatus: 'refreshed',
      error: 'database is locked',
    });
    expect(useAppStore.getState()).toMatchObject({
      overview: refreshed,
      error: 'database is locked',
      isBusy: false,
    });
  });

  it('reconciles routine mutations before refreshing the overview', async () => {
    const result = await useAppStore.getState().createTemplate('ppl');

    expect(repositoryMocks.createRoutineFromTemplate).toHaveBeenCalledWith('ppl');
    expect(pipelineMocks.reconcileAppWorkoutSurfaces).toHaveBeenCalledTimes(1);
    expect(repositoryMocks.getOverview).toHaveBeenCalledTimes(1);
    expect(
      pipelineMocks.reconcileAppWorkoutSurfaces.mock.invocationCallOrder[0]
    ).toBeLessThan(repositoryMocks.getOverview.mock.invocationCallOrder[0]);
    expect(result).toMatchObject({
      status: 'applied',
      publicationStatus: 'published',
      overviewStatus: 'refreshed',
    });
  });

  it('passes edited template body parts to the routine repository', async () => {
    const customization = {
      days: [
        { alias: '밀기', bodyPartIds: [1, 3] },
        { alias: '당기기', bodyPartIds: [2] },
        { alias: '하체', bodyPartIds: [5, 6] },
      ],
    };

    await useAppStore.getState().createTemplate('ppl', customization);

    expect(repositoryMocks.createRoutineFromTemplate).toHaveBeenCalledWith(
      'ppl',
      customization
    );
  });

  it('keeps a committed mutation applied when surface publication is deferred', async () => {
    pipelineMocks.reconcileAppWorkoutSurfaces.mockRejectedValue(new Error('surface unavailable'));
    const refreshed = overviewWithSession(42);
    repositoryMocks.getOverview.mockResolvedValue(refreshed);

    const result = await useAppStore.getState().createTemplate('ppl');

    expect(result).toMatchObject({
      status: 'applied',
      publicationStatus: 'pending',
      publicationError: 'surface unavailable',
      overviewStatus: 'refreshed',
    });
    expect(useAppStore.getState().overview).toBe(refreshed);
  });

  it('rereads the database even when a TypeScript mutation fails', async () => {
    repositoryMocks.createRoutineFromTemplate.mockRejectedValue(new Error('write failed'));
    const refreshed = overviewWithSession(42);
    repositoryMocks.getOverview.mockResolvedValue(refreshed);

    const result = await useAppStore.getState().createTemplate('ppl');

    expect(pipelineMocks.reconcileAppWorkoutSurfaces).not.toHaveBeenCalled();
    expect(repositoryMocks.getOverview).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'error',
      publicationStatus: 'skipped',
      overviewStatus: 'refreshed',
      error: 'write failed',
    });
    expect(useAppStore.getState().overview).toBe(refreshed);
  });

  it('returns noop and skips publication when a TypeScript mutation changes nothing', async () => {
    repositoryMocks.createRoutineFromTemplate.mockResolvedValue(false);

    const result = await useAppStore.getState().createTemplate('ppl');

    expect(result).toMatchObject({
      status: 'noop',
      publicationStatus: 'skipped',
      overviewStatus: 'refreshed',
    });
    expect(pipelineMocks.reconcileAppWorkoutSurfaces).not.toHaveBeenCalled();
    expect(repositoryMocks.getOverview).toHaveBeenCalledTimes(1);
  });

  it('reports a committed mutation separately from an overview refresh failure', async () => {
    repositoryMocks.getOverview.mockRejectedValue(new Error('read failed'));

    const result = await useAppStore.getState().createTemplate('ppl');

    expect(result).toMatchObject({
      status: 'applied',
      overviewStatus: 'failed',
      error: '작업은 저장됐지만 화면을 새로고침하지 못했어요.',
    });
    expect(useAppStore.getState().error).toBe(
      '작업은 저장됐지만 화면을 새로고침하지 못했어요.'
    );
  });

  it('retains the routine repository fallback outside iOS', async () => {
    pipelineMocks.usesNativeWorkoutPipeline.mockReturnValue(false);
    repositoryMocks.startWorkout.mockResolvedValue({
      status: 'applied',
      session: { id: 9 },
    });

    const result = await useAppStore.getState().start({ kind: 'routine', routineDayId: 7 });

    expect(repositoryMocks.startWorkout).toHaveBeenCalledWith({
      kind: 'routine',
      routineDayId: 7,
    });
    expect(pipelineMocks.executeAppWorkoutCommand).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'applied',
      publicationStatus: 'skipped',
      sessionId: 9,
    });
  });

  it('preserves noop and rejected start outcomes from the repository fallback', async () => {
    pipelineMocks.usesNativeWorkoutPipeline.mockReturnValue(false);
    repositoryMocks.startWorkout
      .mockResolvedValueOnce({ status: 'noop', session: { id: 42 } })
      .mockResolvedValueOnce({ status: 'rejected', session: null });

    const noop = await useAppStore.getState().start({ kind: 'routine', routineDayId: 7 });
    const rejected = await useAppStore
      .getState()
      .start({ kind: 'routine', routineDayId: 999 });

    expect(noop).toMatchObject({ status: 'noop', sessionId: 42 });
    expect(rejected).toMatchObject({
      status: 'rejected',
      sessionId: null,
      error: '운동 상태를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.',
    });
  });

  it('passes the expected session id to fallback changes and preserves stale', async () => {
    pipelineMocks.usesNativeWorkoutPipeline.mockReturnValue(false);
    useAppStore.setState({ overview: overviewWithSession(42) });
    repositoryMocks.changeActiveWorkout.mockResolvedValue({
      status: 'stale',
      session: { id: 99 },
    });
    const input = { bodyPartIds: [3], updateRoutine: false };

    const result = await useAppStore.getState().changeActive(input);

    expect(repositoryMocks.changeActiveWorkout).toHaveBeenCalledWith(42, input);
    expect(result).toMatchObject({ status: 'stale', sessionId: 99 });
  });

  it.each([
    ['completeActive', 'completeActiveWorkout', 'noop'],
    ['cancelActive', 'cancelActiveWorkout', 'applied'],
  ] as const)(
    'passes the expected session id to fallback %s and preserves its result',
    async (actionName, mockName, status) => {
      pipelineMocks.usesNativeWorkoutPipeline.mockReturnValue(false);
      useAppStore.setState({ overview: overviewWithSession(42) });
      repositoryMocks[mockName].mockResolvedValue({
        status,
        session: status === 'applied' ? { id: 42 } : null,
      });

      const result = await useAppStore.getState()[actionName]();

      expect(repositoryMocks[mockName]).toHaveBeenCalledWith(42);
      expect(result).toMatchObject({
        status,
        sessionId: status === 'applied' ? 42 : null,
      });
    }
  );

  it('serializes a foreground refresh with a newer mutation and keeps the mutation result', async () => {
    const oldRead = deferred<AppOverview>();
    const newOverview = overviewWithSession(42);
    repositoryMocks.getOverview
      .mockImplementationOnce(() => oldRead.promise)
      .mockResolvedValueOnce(newOverview);

    const refreshPromise = useAppStore.getState().refresh();
    await vi.waitFor(() => expect(repositoryMocks.getOverview).toHaveBeenCalledTimes(1));

    const mutationPromise = useAppStore
      .getState()
      .start({ kind: 'routine', routineDayId: 7 });
    await Promise.resolve();

    expect(pipelineMocks.executeAppWorkoutCommand).not.toHaveBeenCalled();
    expect(repositoryMocks.getOverview).toHaveBeenCalledTimes(1);

    oldRead.resolve(overviewWithSession(7));
    await Promise.all([refreshPromise, mutationPromise]);

    expect(useAppStore.getState().overview).toBe(newOverview);
    expect(pipelineMocks.reconcileAppWorkoutSurfaces).not.toHaveBeenCalled();
  });

  it('serializes refresh reads in request order and ends with the newest result', async () => {
    const oldRead = deferred<AppOverview>();
    const newOverview = overviewWithSession(42);
    repositoryMocks.getOverview
      .mockImplementationOnce(() => oldRead.promise)
      .mockResolvedValueOnce(newOverview);

    const first = useAppStore.getState().refresh();
    await vi.waitFor(() => expect(repositoryMocks.getOverview).toHaveBeenCalledTimes(1));
    const second = useAppStore.getState().refresh();

    await Promise.resolve();
    expect(repositoryMocks.getOverview).toHaveBeenCalledTimes(1);

    oldRead.resolve(overviewWithSession(7));
    await Promise.all([first, second]);

    expect(useAppStore.getState().overview).toBe(newOverview);
    expect(pipelineMocks.reconcileAppWorkoutSurfaces).toHaveBeenCalledTimes(2);
  });

  it('retains an earlier serialized refresh when the next read fails', async () => {
    const oldRead = deferred<AppOverview>();
    const fallbackOverview = overviewWithSession(7);
    repositoryMocks.getOverview
      .mockImplementationOnce(() => oldRead.promise)
      .mockRejectedValueOnce(new Error('new read failed'));

    const first = useAppStore.getState().refresh();
    await vi.waitFor(() => expect(repositoryMocks.getOverview).toHaveBeenCalledTimes(1));
    const second = useAppStore.getState().refresh();

    oldRead.resolve(fallbackOverview);
    await Promise.all([first, second]);

    expect(useAppStore.getState().overview).toBe(fallbackOverview);
    expect(useAppStore.getState().error).toBe('new read failed');
    expect(pipelineMocks.reconcileAppWorkoutSurfaces).toHaveBeenCalledTimes(1);
  });

  it('preserves the first serialized mutation overview if the next mutation reread fails', async () => {
    const firstOverview = overviewWithSession(7);
    repositoryMocks.getOverview
      .mockResolvedValueOnce(firstOverview)
      .mockRejectedValueOnce(new Error('second read failed'));

    const first = useAppStore.getState().createTemplate('ppl');
    const second = useAppStore.getState().createTemplate('upperLower');
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.overviewStatus).toBe('refreshed');
    expect(secondResult).toMatchObject({
      status: 'applied',
      overviewStatus: 'failed',
    });
    expect(useAppStore.getState().overview).toBe(firstOverview);
  });

  it('serializes mutations and keeps busy true while a later mutation is queued', async () => {
    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();
    repositoryMocks.createRoutineFromTemplate
      .mockImplementationOnce(() => firstWrite.promise)
      .mockImplementationOnce(() => secondWrite.promise);

    const first = useAppStore.getState().createTemplate('ppl');
    const second = useAppStore.getState().createTemplate('upperLower');

    await vi.waitFor(() =>
      expect(repositoryMocks.createRoutineFromTemplate).toHaveBeenCalledTimes(1)
    );
    expect(useAppStore.getState().isBusy).toBe(true);

    firstWrite.resolve();
    await vi.waitFor(() =>
      expect(repositoryMocks.createRoutineFromTemplate).toHaveBeenCalledTimes(2)
    );
    await first;
    expect(useAppStore.getState().isBusy).toBe(true);

    secondWrite.resolve();
    await second;
    expect(useAppStore.getState().isBusy).toBe(false);
  });
});

function overviewWithSession(sessionId: number | null): AppOverview {
  return {
    activeSession: sessionId === null ? null : { id: sessionId },
  } as AppOverview;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
