import { DatabaseSync } from 'node:sqlite';

import { describe, expect, it, vi } from 'vitest';

import rawFixture from '@/contracts/workout-command-scenarios.json';
import { getNextRoutineDay } from '@/src/domain/routine';
import type { SessionStatus } from '@/src/types';

const mockedDatabase = vi.hoisted(() => ({ current: null as NodeSQLiteAdapter | null }));

vi.mock('@/src/db/database', () => ({
  getDatabase: async () => {
    if (!mockedDatabase.current) {
      throw new Error('Command contract test database is not configured.');
    }
    return mockedDatabase.current;
  },
  resetDatabaseForDevelopment: async () => undefined,
  withDatabaseReadTransaction: async <T>(
    task: (database: NodeSQLiteAdapter) => Promise<T>
  ) => {
    if (!mockedDatabase.current) {
      throw new Error('Command contract test database is not configured.');
    }
    return mockedDatabase.current.withExclusiveTransactionAsync(task);
  },
}));

import {
  cancelActiveWorkout,
  changeActiveWorkout,
  completeActiveWorkout,
  getActiveRoutine,
  getOverview,
  getRoutineDays,
  getRoutineProgress,
  getSessionById,
  startWorkout,
  type RepositoryWorkoutResult,
  updateSession,
} from '@/src/db/repository';
import { MIGRATION_SQL } from '@/src/db/schema';

type SessionReference = { ref: string; offset?: number };

type ContractCommand =
  | { type: 'startNext' }
  | { type: 'startRoutine'; routineDayId: number }
  | { type: 'startFree'; bodyPartIds: number[]; label?: string }
  | { type: 'changeRoutine'; expectedSessionId: SessionReference; routineDayId: number }
  | { type: 'changeFree'; expectedSessionId: SessionReference; bodyPartIds: number[] }
  | { type: 'complete'; expectedSessionId: SessionReference }
  | { type: 'cancel'; expectedSessionId: SessionReference };

type CommandScenarioFixture = {
  version: number;
  seed: {
    routineId: number;
    nextRoutineDayId: number;
    bodyParts: Array<{
      id: number;
      name: string;
      color: string;
      sortOrder: number;
    }>;
    routineDays: Array<{
      id: number;
      name: string;
      sortOrder: number;
      bodyPartIds: number[];
    }>;
  };
  scenarios: Array<{
    id: string;
    steps: Array<{
      command: ContractCommand;
      captureSessionAs?: string;
      expect: {
        status: RepositoryWorkoutResult['status'];
        sessionId: 'nonNull' | SessionReference | null;
      };
    }>;
    expectState: {
      activeSessionCount: number;
      nextRoutineDayId: number;
      sessions: Array<{
        ref: string;
        status: SessionStatus;
        routineDayId: number | null;
        parts: string[];
      }>;
    };
  }>;
};

const fixture = rawFixture as CommandScenarioFixture;

describe('shared workout command contract (TypeScript repository fallback)', () => {
  it('uses the supported shared contract version', () => {
    expect(fixture.version).toBe(1);
  });

  for (const scenario of fixture.scenarios) {
    it(scenario.id, async () => {
      const database = new NodeSQLiteAdapter();
      mockedDatabase.current = database;

      try {
        database.exec(MIGRATION_SQL);
        seedDatabase(database, fixture.seed);
        const sessions = new Map<string, number>();

        for (const [stepIndex, step] of scenario.steps.entries()) {
          const result = await executeCommand(step.command, sessions);
          const message = `${scenario.id} step ${stepIndex + 1} (${step.command.type})`;

          expect(result.status, message).toBe(step.expect.status);
          assertExpectedSession(result.session?.id ?? null, step.expect.sessionId, sessions, message);

          if (step.captureSessionAs) {
            expect(result.session?.id, `${message} must capture a session`).toBeTypeOf('number');
            sessions.set(step.captureSessionAs, result.session!.id);
          }
        }

        assertExpectedState(database, scenario.expectState, sessions, scenario.id);
      } finally {
        database.close();
        mockedDatabase.current = null;
      }
    });
  }
});

describe('historical session snapshot preservation', () => {
  it('keeps the frozen routine title and parts when only metadata changes', async () => {
    await withSeededDatabase(async (database) => {
      const started = await startWorkout({ kind: 'routine', routineDayId: 101 });
      const sessionId = expectSessionId(started);

      database.run(`UPDATE routine_days SET name = 'Renamed Push' WHERE id = 101`);
      database.run(`UPDATE body_parts SET name = '변경된 가슴', is_archived = 1 WHERE id = 1`);

      expect(await updateSession(sessionId, {
        note: '메모만 수정',
        routineDayId: 101,
      })).toBe(true);

      const session = await getSessionById(sessionId);
      expect(session?.routineDayNameSnapshot).toBe('Push');
      expect(session?.parts.map((part) => ({
        id: part.bodyPartId,
        name: part.bodyPartName,
      }))).toEqual([{ id: 1, name: '가슴' }]);
      expect(session?.note).toBe('메모만 수정');
    });
  });

  it('keeps custom and archived free snapshots for unchanged and retained parts', async () => {
    await withSeededDatabase(async (database) => {
      const started = await startWorkout({ kind: 'free', bodyPartIds: [3] });
      const sessionId = expectSessionId(started);
      database.run(
        `INSERT INTO workout_session_parts_snapshot
         (workout_session_id, body_part_id, body_part_name, body_part_color, sort_order)
         VALUES (?, NULL, '커스텀 운동', '#123456', 1)`,
        sessionId
      );
      database.run(`UPDATE body_parts SET is_archived = 1 WHERE id = 3`);

      expect(await updateSession(sessionId, {
        note: '시간과 메모 수정',
        routineDayId: null,
        bodyPartIds: [3],
      })).toBe(true);
      let session = await getSessionById(sessionId);
      expect(session?.parts.map((part) => [part.bodyPartId, part.bodyPartName])).toEqual([
        [3, '하체'],
        [null, '커스텀 운동'],
      ]);

      expect(await updateSession(sessionId, {
        routineDayId: null,
        bodyPartIds: [3, 2],
      })).toBe(true);
      session = await getSessionById(sessionId);
      expect(session?.parts.map((part) => [part.bodyPartId, part.bodyPartName])).toEqual([
        [3, '하체'],
        [null, '커스텀 운동'],
        [2, '등'],
      ]);
    });
  });

  it('regenerates snapshots when the workout target actually changes', async () => {
    await withSeededDatabase(async (database) => {
      const started = await startWorkout({ kind: 'routine', routineDayId: 101 });
      const sessionId = expectSessionId(started);
      database.run(`UPDATE routine_days SET name = '새 Pull' WHERE id = 102`);

      expect(await updateSession(sessionId, { routineDayId: 102 })).toBe(true);

      const session = await getSessionById(sessionId);
      expect(session?.routineDayId).toBe(102);
      expect(session?.routineDayNameSnapshot).toBe('새 Pull');
      expect(session?.parts.map((part) => part.bodyPartName)).toEqual(['등']);
    });
  });
});

describe('overview historical split labels', () => {
  it('groups dashboard split totals by frozen session title instead of the current title', async () => {
    await withSeededDatabase(async (database) => {
      const now = new Date();
      const startedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const endedAt = now.toISOString();
      database.run(`UPDATE routine_days SET name = '현재 Push' WHERE id = 101`);

      insertCompletedRoutineSession(database, {
        startedAt,
        endedAt,
        durationSeconds: 600,
        routineDayNameSnapshot: '예전 Push',
      });
      insertCompletedRoutineSession(database, {
        startedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        endedAt,
        durationSeconds: 900,
        routineDayNameSnapshot: '새 Push',
      });
      insertCompletedRoutineSession(database, {
        startedAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
        endedAt,
        durationSeconds: 300,
        routineDayNameSnapshot: null,
      });

      const overview = await getOverview(now);
      expect(overview.rangeStats.last7.bySplit).toEqual([
        { name: '새 Push', workoutCount: 1, durationSeconds: 900 },
        { name: '예전 Push', workoutCount: 1, durationSeconds: 600 },
        { name: '삭제된 분할', workoutCount: 1, durationSeconds: 300 },
      ]);
    });
  });
});

async function withSeededDatabase(
  task: (database: NodeSQLiteAdapter) => Promise<void>
): Promise<void> {
  const database = new NodeSQLiteAdapter();
  mockedDatabase.current = database;
  try {
    database.exec(MIGRATION_SQL);
    seedDatabase(database, fixture.seed);
    await task(database);
  } finally {
    database.close();
    mockedDatabase.current = null;
  }
}

function expectSessionId(result: RepositoryWorkoutResult): number {
  expect(result.status).toBe('applied');
  expect(result.session?.id).toBeTypeOf('number');
  return result.session!.id;
}

function insertCompletedRoutineSession(
  database: NodeSQLiteAdapter,
  input: {
    startedAt: string;
    endedAt: string;
    durationSeconds: number;
    routineDayNameSnapshot: string | null;
  }
): void {
  database.run(
    `INSERT INTO workout_sessions
     (routine_id, routine_day_id, routine_day_name_snapshot, started_at, ended_at,
      duration_seconds, status, note, created_at, updated_at)
     VALUES (10, 101, ?, ?, ?, ?, 'completed', NULL, ?, ?)`,
    input.routineDayNameSnapshot,
    input.startedAt,
    input.endedAt,
    input.durationSeconds,
    input.startedAt,
    input.endedAt
  );
}

async function executeCommand(
  command: ContractCommand,
  sessions: ReadonlyMap<string, number>
): Promise<RepositoryWorkoutResult> {
  switch (command.type) {
    case 'startNext': {
      const routine = await getActiveRoutine();
      const days = await getRoutineDays(routine?.id);
      const progress = await getRoutineProgress();
      const next = getNextRoutineDay(days, progress);
      return next
        ? startWorkout({ kind: 'routine', routineDayId: next.id })
        : { status: 'rejected', session: null };
    }
    case 'startRoutine':
      return startWorkout({ kind: 'routine', routineDayId: command.routineDayId });
    case 'startFree':
      return startWorkout({
        kind: 'free',
        bodyPartIds: command.bodyPartIds,
        label: command.label,
      });
    case 'changeRoutine':
      return changeActiveWorkout(resolveReference(command.expectedSessionId, sessions), {
        kind: 'routine',
        routineDayId: command.routineDayId,
      });
    case 'changeFree':
      return changeActiveWorkout(resolveReference(command.expectedSessionId, sessions), {
        kind: 'free',
        bodyPartIds: command.bodyPartIds,
      });
    case 'complete':
      return completeActiveWorkout(resolveReference(command.expectedSessionId, sessions));
    case 'cancel':
      return cancelActiveWorkout(resolveReference(command.expectedSessionId, sessions));
  }
}

function assertExpectedSession(
  actual: number | null,
  expected: 'nonNull' | SessionReference | null,
  sessions: ReadonlyMap<string, number>,
  message: string
): void {
  if (expected === 'nonNull') {
    expect(actual, message).not.toBeNull();
    return;
  }
  if (expected === null) {
    expect(actual, message).toBeNull();
    return;
  }
  expect(actual, message).toBe(resolveReference(expected, sessions));
}

function assertExpectedState(
  database: NodeSQLiteAdapter,
  expected: CommandScenarioFixture['scenarios'][number]['expectState'],
  sessions: ReadonlyMap<string, number>,
  scenarioId: string
): void {
  const active = database.getFirst<{ count: number }>(
    `SELECT COUNT(*) AS count FROM workout_sessions WHERE status = 'active'`
  );
  expect(active?.count, `${scenarioId} active session count`).toBe(expected.activeSessionCount);

  const progress = database.getFirst<{ next_routine_day_id: number | null }>(
    `SELECT next_routine_day_id FROM routine_progress WHERE id = 1`
  );
  expect(progress?.next_routine_day_id, `${scenarioId} routine progress`).toBe(
    expected.nextRoutineDayId
  );

  for (const expectedSession of expected.sessions) {
    const sessionId = resolveReference({ ref: expectedSession.ref }, sessions);
    const row = database.getFirst<{
      status: SessionStatus;
      routine_day_id: number | null;
    }>(
      `SELECT status, routine_day_id FROM workout_sessions WHERE id = ?`,
      sessionId
    );
    expect(row?.status, `${scenarioId} session ${expectedSession.ref} status`).toBe(
      expectedSession.status
    );
    expect(row?.routine_day_id, `${scenarioId} session ${expectedSession.ref} target`).toBe(
      expectedSession.routineDayId
    );

    const partRows = database.getAll<{ body_part_name: string }>(
      `SELECT body_part_name FROM workout_session_parts_snapshot
       WHERE workout_session_id = ? ORDER BY sort_order, id`,
      sessionId
    );
    expect(
      partRows.map((part) => part.body_part_name),
      `${scenarioId} session ${expectedSession.ref} parts`
    ).toEqual(expectedSession.parts);
  }
}

function resolveReference(
  reference: SessionReference,
  sessions: ReadonlyMap<string, number>
): number {
  const sessionId = sessions.get(reference.ref);
  if (sessionId === undefined) {
    throw new Error(`Unknown session reference: ${reference.ref}`);
  }
  return sessionId + (reference.offset ?? 0);
}

function seedDatabase(
  database: NodeSQLiteAdapter,
  seed: CommandScenarioFixture['seed']
): void {
  const now = new Date().toISOString();

  for (const part of seed.bodyParts) {
    database.run(
      `INSERT INTO body_parts
       (id, name, color, sort_order, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      part.id,
      part.name,
      part.color,
      part.sortOrder,
      now,
      now
    );
  }
  database.run(
    `INSERT INTO routines (id, name, is_active, created_at, updated_at)
     VALUES (?, 'Contract Routine', 1, ?, ?)`,
    seed.routineId,
    now,
    now
  );
  for (const day of seed.routineDays) {
    database.run(
      `INSERT INTO routine_days (id, routine_id, name, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      day.id,
      seed.routineId,
      day.name,
      day.sortOrder,
      now,
      now
    );
    for (const [sortOrder, bodyPartId] of day.bodyPartIds.entries()) {
      database.run(
        `INSERT INTO routine_day_parts (routine_day_id, body_part_id, sort_order)
         VALUES (?, ?, ?)`,
        day.id,
        bodyPartId,
        sortOrder
      );
    }
  }
  database.run(
    `INSERT INTO routine_progress
     (id, active_routine_id, next_routine_day_id, updated_at)
     VALUES (1, ?, ?, ?)`,
    seed.routineId,
    seed.nextRoutineDayId,
    now
  );
}

type SQLiteParameter = string | number | null;

class NodeSQLiteAdapter {
  private readonly database = new DatabaseSync(':memory:');

  exec(source: string): void {
    this.database.exec(source);
  }

  async execAsync(source: string): Promise<void> {
    this.exec(source);
  }

  run(source: string, ...params: SQLiteParameter[]) {
    return this.database.prepare(source).run(...params);
  }

  async runAsync(source: string, ...params: unknown[]) {
    const normalized = normalizeParameters(params);
    const result = this.run(source, ...normalized);
    return {
      changes: Number(result.changes),
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  getFirst<T>(source: string, ...params: SQLiteParameter[]): T | null {
    return (this.database.prepare(source).get(...params) as T | undefined) ?? null;
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    return this.getFirst<T>(source, ...normalizeParameters(params));
  }

  getAll<T>(source: string, ...params: SQLiteParameter[]): T[] {
    return this.database.prepare(source).all(...params) as T[];
  }

  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    return this.getAll<T>(source, ...normalizeParameters(params));
  }

  async withExclusiveTransactionAsync<T>(
    task: (database: NodeSQLiteAdapter) => Promise<T>
  ): Promise<T> {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = await task(this);
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

function normalizeParameters(params: unknown[]): SQLiteParameter[] {
  const values = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  return values.map((value) => {
    if (value === null || typeof value === 'string' || typeof value === 'number') {
      return value;
    }
    throw new Error(`Unsupported SQLite test parameter: ${String(value)}`);
  });
}
