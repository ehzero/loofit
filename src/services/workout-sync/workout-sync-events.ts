type WorkoutSyncTrigger = (delayMs?: number) => void;

let trigger: WorkoutSyncTrigger | null = null;

export const registerWorkoutSyncTrigger = (
  nextTrigger: WorkoutSyncTrigger
): (() => void) => {
  trigger = nextTrigger;
  return () => {
    if (trigger === nextTrigger) {
      trigger = null;
    }
  };
};

export const requestWorkoutSync = (delayMs = 0): void => {
  trigger?.(delayMs);
};
