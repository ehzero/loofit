export type SessionStatus = 'active' | 'completed' | 'canceled';

export type BodyPart = {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Routine = {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RoutineDay = {
  id: number;
  routineId: number;
  name: string;
  sortOrder: number;
  parts: BodyPart[];
  createdAt: string;
  updatedAt: string;
};

export type WorkoutSession = {
  id: number;
  routineId: number | null;
  routineDayId: number | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  status: SessionStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  parts: WorkoutSessionPartSnapshot[];
};

export type WorkoutSessionPartSnapshot = {
  id: number;
  workoutSessionId: number;
  bodyPartId: number | null;
  bodyPartName: string;
  bodyPartColor: string;
  sortOrder: number;
};

export type RoutineProgress = {
  activeRoutineId: number | null;
  nextRoutineDayId: number | null;
  updatedAt: string;
};

export type StartWorkoutInput =
  | {
      kind: 'routine';
      routineDayId: number;
    }
  | {
      kind: 'free';
      bodyPartIds: number[];
      label?: string;
    };

export type SessionTarget =
  | {
      kind: 'routine';
      routineDay: RoutineDay;
    }
  | {
      kind: 'free';
      bodyParts: BodyPart[];
      label?: string;
    };

export type HeatmapBucket = 0 | 1 | 2 | 3 | 4;

export type HeatmapDay = {
  dateKey: string;
  durationSeconds: number;
  bucket: HeatmapBucket;
};

export type HeatmapGridCell = HeatmapDay & {
  /** false for leading placeholder cells used to align the grid to weekday columns. */
  inRange: boolean;
};

export type RangeStats = {
  workoutCount: number;
  durationSeconds: number;
};

export type DashboardStats = {
  weekWorkoutCount: number;
  totalDurationSeconds: number;
  byBodyPart: Array<{
    name: string;
    color: string;
    durationSeconds: number;
  }>;
};

export type AppOverview = {
  bodyParts: BodyPart[];
  activeRoutine: Routine | null;
  routineDays: RoutineDay[];
  progress: RoutineProgress | null;
  nextRoutineDay: RoutineDay | null;
  activeSession: WorkoutSession | null;
  latestCompletedToday: WorkoutSession | null;
  todaySessions: WorkoutSession[];
  recentSessions: WorkoutSession[];
  heatmap7: HeatmapDay[];
  heatmap30: HeatmapDay[];
  heatmapGrid: HeatmapGridCell[];
  heatmapYear: HeatmapGridCell[];
  dashboard: DashboardStats;
  rangeStats: {
    last7: RangeStats;
    last30: RangeStats;
    last365: RangeStats;
  };
};

export type RoutineTemplate = 'ppl' | 'threeSplit' | 'fourSplit' | 'upperLower';
