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
      { name: '가슴 + 삼두', parts: ['가슴', '삼두'] },
      { name: '등 + 이두', parts: ['등', '이두'] },
      { name: '하체 + 어깨', parts: ['하체', '어깨'] },
    ],
  },
  upperLower: {
    name: '상하체',
    days: [
      { name: '상체', parts: ['가슴', '등', '어깨', '팔'] },
      { name: '하체 + 코어', parts: ['하체', '코어'] },
    ],
  },
};
