import type { RoutineTemplate } from '@/src/types';

export const ROUTINE_TEMPLATES: Record<
  RoutineTemplate,
  {
    name: string;
    days: Array<{
      name: string;
      parts: string[];
    }>;
  }
> = {
  // A day's name is an optional alias. Only PPL ships with aliases (its day
  // names are the vocabulary users think in); every other template starts
  // without aliases so days display their part lists.
  ppl: {
    name: 'PPL',
    days: [
      { name: 'Push', parts: ['가슴', '어깨', '삼두'] },
      { name: 'Pull', parts: ['등', '이두'] },
      { name: 'Legs', parts: ['하체'] },
    ],
  },
  threeSplit: {
    name: '3분할',
    days: [
      { name: '', parts: ['가슴', '삼두'] },
      { name: '', parts: ['등', '이두'] },
      { name: '', parts: ['하체', '어깨'] },
    ],
  },
  fourSplit: {
    name: '4분할',
    days: [
      { name: '', parts: ['가슴', '삼두'] },
      { name: '', parts: ['등', '이두'] },
      { name: '', parts: ['어깨'] },
      { name: '', parts: ['하체'] },
    ],
  },
  upperLower: {
    name: '2분할',
    days: [
      { name: '', parts: ['가슴', '등', '어깨', '팔'] },
      { name: '', parts: ['하체', '코어'] },
    ],
  },
};
