import { describe, expect, it } from 'vitest';

import type { RoutineDay } from '@/src/types';

import {
  getNextRoutineDay,
  getRoutineDayAfterCompletion,
  hasRoutineDayAlias,
  routineDayDisplayName,
  workoutSessionDisplayName,
} from './routine';

const days: RoutineDay[] = [
  makeDay(1, 'Push', 0),
  makeDay(2, 'Pull', 1),
  makeDay(3, 'Legs', 2),
];

describe('routine policy', () => {
  it('uses the progress pointer for the next recommendation', () => {
    expect(getNextRoutineDay(days, { activeRoutineId: 1, nextRoutineDayId: 2, updatedAt: '' })?.name).toBe(
      'Pull'
    );
  });

  it('advances from the actually completed routine day', () => {
    expect(getRoutineDayAfterCompletion(days, 2)?.name).toBe('Legs');
  });

  it('wraps after the last routine day', () => {
    expect(getRoutineDayAfterCompletion(days, 3)?.name).toBe('Push');
  });
});

describe('routine day display name', () => {
  const parts = [{ name: '가슴' }, { name: '삼두' }];

  it('prefers the alias when set', () => {
    expect(routineDayDisplayName({ name: 'Push', parts })).toBe('Push');
    expect(hasRoutineDayAlias({ name: 'Push', parts })).toBe(true);
  });

  it('derives the name from parts when the alias is empty', () => {
    expect(routineDayDisplayName({ name: '', parts })).toBe('가슴 · 삼두');
    expect(routineDayDisplayName({ name: '  ', parts })).toBe('가슴 · 삼두');
    expect(hasRoutineDayAlias({ name: ' ', parts })).toBe(false);
  });

  it('falls back to a placeholder when there is no alias and no parts', () => {
    expect(routineDayDisplayName({ name: '', parts: [] })).toBe('새 분할');
  });
});

describe('historical workout session display name', () => {
  it('prefers the frozen routine split title over body-part rows', () => {
    expect(
      workoutSessionDisplayName({
        routineDayNameSnapshot: 'Push',
        parts: [{ bodyPartName: '가슴' }, { bodyPartName: '삼두' }],
      })
    ).toBe('Push');
  });

  it('uses frozen body-part names when a historical record has no split title', () => {
    expect(
      workoutSessionDisplayName({
        routineDayNameSnapshot: null,
        parts: [{ bodyPartName: '가슴' }, { bodyPartName: '삼두' }],
      })
    ).toBe('가슴 · 삼두');
  });
});

function makeDay(id: number, name: string, sortOrder: number): RoutineDay {
  return {
    id,
    routineId: 1,
    name,
    sortOrder,
    parts: [],
    createdAt: '',
    updatedAt: '',
  };
}
