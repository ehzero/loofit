import { describe, expect, it } from 'vitest';

import type { RoutineDay } from '@/src/types';

import { getNextRoutineDay, getRoutineDayAfterCompletion } from './routine';

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
