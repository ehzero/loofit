export type WorkoutControlWidgetProps = {
  state: 'idle' | 'active' | 'completed';
  /** Big headline: next-day display name, active parts, or completed parts. */
  title: string;
  /** Secondary line (part list); empty string hides it. */
  subtitle: string;
  /** Completed state: formatted total duration. */
  durationLabel: string;
  startedAt?: string;
  accent: string;
};

export type HeatmapWidgetProps = {
  /**
   * Heatmap cell colors precomputed on the app side, joined with commas.
   * A flat string keeps the widget props trivially serializable and the
   * widget-side parsing (split) dependency-free.
   */
  colors: string;
};

export type WorkoutLiveActivityProps = {
  title: string;
  subtitle: string;
  startedAt: string;
  accent: string;
};
