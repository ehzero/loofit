import type {
  BodyPart,
  RoutineTemplate,
  RoutineTemplateCustomization,
} from '@/src/types';

export type RoutineTemplateConfig = {
  name: string;
  days: Array<{
    name: string;
    parts: string[];
  }>;
};

export const ROUTINE_TEMPLATES: Record<RoutineTemplate, RoutineTemplateConfig> = {
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

export type RoutineTemplateOption = {
  key: RoutineTemplate;
  name: string;
  description: string;
};

export const ROUTINE_TEMPLATE_OPTIONS: RoutineTemplateOption[] = [
  { key: 'upperLower', name: '2분할', description: '상체 / 하체+코어' },
  { key: 'threeSplit', name: '3분할', description: '가슴·삼두 / 등·이두 / 하체·어깨' },
  { key: 'fourSplit', name: '4분할', description: '가슴·삼두 / 등·이두 / 어깨 / 하체' },
  { key: 'ppl', name: 'PPL', description: 'Push · Pull · Legs' },
];

export function isRoutineTemplate(value: string | undefined): value is RoutineTemplate {
  return ROUTINE_TEMPLATE_OPTIONS.some((template) => template.key === value);
}

export function buildRoutineTemplateCustomization(
  template: RoutineTemplate,
  bodyParts: BodyPart[]
): RoutineTemplateCustomization {
  const bodyPartIdByName = new Map(bodyParts.map((part) => [part.name, part.id]));

  return {
    days: ROUTINE_TEMPLATES[template].days.map((day) => ({
      alias: day.name,
      bodyPartIds: day.parts
        .map((partName) => bodyPartIdByName.get(partName))
        .filter((id): id is number => id !== undefined),
    })),
  };
}
