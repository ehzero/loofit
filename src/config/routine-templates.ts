import type { RoutineTemplate } from '@/src/types';

export type RoutineTemplateOption = {
  key: RoutineTemplate;
  name: string;
  description: string;
};

export const ROUTINE_TEMPLATE_OPTIONS: RoutineTemplateOption[] = [
  { key: 'threeSplit', name: '3분할', description: '가슴·삼두 / 등·이두 / 하체·어깨' },
  { key: 'fourSplit', name: '4분할', description: '가슴·삼두 / 등·이두 / 어깨 / 하체' },
  { key: 'upperLower', name: '2분할', description: '상체 / 하체+코어' },
  { key: 'ppl', name: 'PPL', description: 'Push · Pull · Legs' },
];
