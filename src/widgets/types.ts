export type HeatmapWidgetProps = {
  /** Display title shown in the heatmap widget header. */
  title: string;
  /**
   * Heatmap cell colors precomputed on the app side, joined with commas.
   * A flat string keeps the widget props trivially serializable and the
   * widget-side parsing (split) dependency-free.
   */
  colors: string;
  /** Day-of-month labels aligned 1:1 with `colors`, joined with commas. */
  labels: string;
  /** Per-cell label colors aligned 1:1 with `colors`, joined with commas. */
  labelColors: string;
  /** Calendar weekday labels for 7-column widgets, Sunday-first. */
  weekdayLabels: string;
  /** Month labels aligned to week columns for the medium heatmap widget. */
  monthLabels: string;
  brandName: string;
  /** Footer stat labels for compact widgets, joined with commas. */
  footerStatLabels: string;
  /** Footer stat values for compact widgets, joined with commas. */
  footerStatValues: string;
  /** Section label for recent workout rows. */
  recentWorkoutLabel: string;
  /** Recent workout left-side text rows, joined with commas. */
  recentWorkoutTitles: string;
  /** Recent workout right-side date labels, joined with commas. */
  recentWorkoutMetas: string;
  background: string;
  titleColor: string;
  brandColor: string;
  footerValueColor: string;
  weekdayLabelColor: string;
  titleSize: number;
  brandSize: number;
  weekdayLabelSize: number;
  monthLabelSize: number;
  cellLabelSize: number;
  contentPadding: number;
  cellGap: number;
  cellRadius: number;
  headerGap: number;
  columns: number;
};

export type WorkoutLockScreenWidgetProps = {
  state: 'idle' | 'active' | 'completed';
  brandName: string;
  inlineText: string;
  circularValue: string;
  rectangularEyebrow: string;
  rectangularTitle: string;
  rectangularDetail: string;
  startedAt?: string;
  accent: string;
  background: string;
  titleColor: string;
  detailColor: string;
};

export type WorkoutLockScreenSummaryWidgetProps = {
  brandName: string;
  title: string;
  streakFlags: string;
  summaryText: string;
  accent: string;
  background: string;
  titleColor: string;
  detailColor: string;
};
