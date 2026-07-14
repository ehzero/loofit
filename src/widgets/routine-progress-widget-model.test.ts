import { describe, expect, it } from 'vitest';

import { resolveRoutineProgressLabels } from './routine-progress-widget-model';

describe('resolveRoutineProgressLabels', () => {
  it('uses an alias and keeps distinct body parts as detail', () => {
    expect(resolveRoutineProgressLabels({ split: 'Push', bodyParts: '가슴·어깨·삼두' })).toEqual({
      workoutLabel: 'Push',
      bodyPartDetail: '가슴·어깨·삼두',
    });
  });

  it('uses body parts as the label without repeating them as detail', () => {
    expect(resolveRoutineProgressLabels({ split: '  ', bodyParts: '하체' })).toEqual({
      workoutLabel: '하체',
      bodyPartDetail: '',
    });
  });

  it('omits body-part detail when it matches the alias', () => {
    expect(resolveRoutineProgressLabels({ split: '하체', bodyParts: '하체' })).toEqual({
      workoutLabel: '하체',
      bodyPartDetail: '',
    });
  });
});
