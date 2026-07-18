import { describe, expect, it } from 'vitest';

import type { BodyPart } from '@/src/types';

import {
  buildRoutineTemplateCustomization,
  isRoutineTemplate,
  ROUTINE_TEMPLATE_OPTIONS,
} from './routine-templates';

describe('routine template configuration', () => {
  it('lists the two-split template first', () => {
    expect(ROUTINE_TEMPLATE_OPTIONS.map((template) => template.key)).toEqual([
      'upperLower',
      'threeSplit',
      'fourSplit',
      'ppl',
    ]);
  });

  it('maps the template body-part names to persisted ids in template order', () => {
    const bodyParts = [
      { id: 9, name: '삼두' },
      { id: 4, name: '가슴' },
      { id: 7, name: '등' },
      { id: 2, name: '이두' },
      { id: 6, name: '하체' },
      { id: 1, name: '어깨' },
    ] as BodyPart[];

    expect(buildRoutineTemplateCustomization('threeSplit', bodyParts)).toEqual({
      days: [
        { alias: '', bodyPartIds: [4, 9] },
        { alias: '', bodyPartIds: [7, 2] },
        { alias: '', bodyPartIds: [6, 1] },
      ],
    });
  });

  it('keeps the template aliases editable in the draft', () => {
    const bodyParts = [
      { id: 1, name: '가슴' },
      { id: 2, name: '어깨' },
      { id: 3, name: '삼두' },
      { id: 4, name: '등' },
      { id: 5, name: '이두' },
      { id: 6, name: '하체' },
    ] as BodyPart[];

    expect(
      buildRoutineTemplateCustomization('ppl', bodyParts).days.map((day) => day.alias)
    ).toEqual(['Push', 'Pull', 'Legs']);
  });

  it('rejects unknown route parameters', () => {
    expect(isRoutineTemplate('ppl')).toBe(true);
    expect(isRoutineTemplate('fiveSplit')).toBe(false);
    expect(isRoutineTemplate(undefined)).toBe(false);
  });
});
