import type { HeatmapDay } from '@/src/types';

export type WorkoutControlWidgetProps = {
  state: 'idle' | 'active' | 'completed';
  title: string;
  subtitle: string;
  durationLabel: string;
  startedAt?: string;
};

export type HeatmapCalendarWidgetProps = {
  days: HeatmapDay[];
};

export type WorkoutLiveActivityProps = {
  title: string;
  subtitle: string;
  startedAt: string;
};
