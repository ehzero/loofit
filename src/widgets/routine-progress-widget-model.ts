export type RoutineProgressLabelInput = {
  bodyParts: string;
  split: string;
};

export function resolveRoutineProgressLabels({
  bodyParts,
  split,
}: RoutineProgressLabelInput): {
  bodyPartDetail: string;
  workoutLabel: string;
} {
  const alias = split.trim();
  const detail = bodyParts.trim();

  return {
    workoutLabel: alias || detail,
    bodyPartDetail: alias && alias !== detail ? detail : '',
  };
}
