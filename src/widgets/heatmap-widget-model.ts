import { BRAND } from '@/src/config/brand';
import { formatDuration } from '@/src/domain/date';
import { heatColor, type ThemeColors } from '@/src/theme/tokens';
import type { HeatmapDay, RangeStats } from '@/src/types';

import type { HeatmapWidgetProps } from './types';
import { WIDGET_PREVIEW_SPEC, type HeatmapWidgetVariant } from './widget-spec';

type HeatmapCellInput = Pick<HeatmapDay, 'bucket' | 'dateKey'> & {
  inRange?: boolean;
  isGap?: boolean;
};

const TRANSPARENT_CELL = '#00000000';
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export type HeatmapWidgetCell = {
  color: string;
  label: string;
  labelColor: string;
};

export type HeatmapWidgetFooterProps = Pick<
  HeatmapWidgetProps,
  | 'footerStatLabels'
  | 'footerStatValues'
  | 'recentWorkoutLabel'
  | 'recentWorkoutTitles'
  | 'recentWorkoutMetas'
>;

export function buildHeatmapWidgetProps({
  title,
  variant,
  cells,
  colors,
  footer,
}: {
  title?: string;
  variant: HeatmapWidgetVariant;
  cells: HeatmapCellInput[];
  colors: ThemeColors;
  footer?: HeatmapWidgetFooterProps;
}): HeatmapWidgetProps {
  const spec = WIDGET_PREVIEW_SPEC.heatmap[variant];
  const widgetCells =
    variant === 'year'
      ? insertMonthTransitionGapCells(
          buildRecentMonthCells(cells, WIDGET_PREVIEW_SPEC.heatmap.year.months)
        )
      : cells;
  const monthLabels = variant === 'year' ? buildWeekMonthLabels(widgetCells) : [];
  const weekCount = variant === 'year' ? Math.ceil(widgetCells.length / 7) : 0;

  return {
    title: title ?? defaultHeatmapWidgetTitle(variant),
    // Widget previews intentionally show calendar placeholders as ordinary
    // empty cells, not transparent holes, so the grid keeps a stable rectangular
    // silhouette that matches the app preview design.
    colors: widgetCells.map((cell) => heatmapCellColor(colors, cell)).join(','),
    labels: widgetCells.map((cell) => (cell.isGap ? '' : dayOfMonthLabel(cell.dateKey))).join(','),
    labelColors: widgetCells.map((cell) => heatmapCellLabelColor(colors, cell)).join(','),
    weekdayLabels: WEEKDAY_LABELS.join(','),
    monthLabels: monthLabels.join(','),
    monthGapBeforeWeeks: Array.from({ length: weekCount }, () => '0').join(','),
    brandName: BRAND.displayName,
    footerStatLabels: footer?.footerStatLabels ?? '',
    footerStatValues: footer?.footerStatValues ?? '',
    recentWorkoutLabel: footer?.recentWorkoutLabel ?? '',
    recentWorkoutTitles: footer?.recentWorkoutTitles ?? '',
    recentWorkoutMetas: footer?.recentWorkoutMetas ?? '',
    background: colors.card,
    titleColor: colors.tx3,
    brandColor: colors.tx5,
    footerValueColor: colors.tx2,
    weekdayLabelColor: colors.tx4,
    titleSize: WIDGET_PREVIEW_SPEC.text.label.size,
    brandSize: WIDGET_PREVIEW_SPEC.text.brand.size,
    weekdayLabelSize: WIDGET_PREVIEW_SPEC.text.calendar.weekdaySize,
    monthLabelSize: WIDGET_PREVIEW_SPEC.text.calendar.monthSize,
    cellLabelSize: spec.cellLabelSize,
    contentPadding: WIDGET_PREVIEW_SPEC.card.padding,
    cellGap: spec.cellGap,
    cellRadius: spec.cellRadius,
    headerGap: spec.headerGap,
    columns: 'columns' in spec ? spec.columns : 0,
    monthGapColumns: 'monthGapColumns' in spec ? spec.monthGapColumns : 0,
  };
}

export function formatHeatmapWidgetTitle(label: string, workoutCount: number): string {
  return `${label} · ${workoutCount}회`;
}

export function formatSixMonthHeatmapWidgetTitle(stats: RangeStats): string {
  return `지난 6개월 · ${stats.workoutCount}회 · 총 ${formatDuration(
    stats.durationSeconds
  )} · 평균 ${formatDuration(averageDurationSeconds(stats))}`;
}

function averageDurationSeconds(stats: RangeStats): number {
  return stats.workoutCount ? Math.round(stats.durationSeconds / stats.workoutCount) : 0;
}

export function buildHeatmapWidgetRows(
  props: HeatmapWidgetProps,
  variant: HeatmapWidgetVariant
): HeatmapWidgetCell[][] {
  const colors = parseHeatmapWidgetList(props.colors).filter(Boolean);
  const labels = parseHeatmapWidgetList(props.labels);
  const labelColors = parseHeatmapWidgetList(props.labelColors);
  const cells = colors.map<HeatmapWidgetCell>((color, index) => ({
    color,
    label: labels[index] ?? '',
    labelColor: labelColors[index] ?? props.weekdayLabelColor,
  }));
  const columns =
    props.columns > 0
      ? props.columns
      : variant === 'week' || variant === 'month'
        ? WIDGET_PREVIEW_SPEC.heatmap[variant].columns
        : 7;

  if (variant === 'year') {
    const weekCount = Math.ceil(cells.length / 7);
    return Array.from({ length: 7 }, (_, weekday) =>
      Array.from(
        { length: weekCount },
        (_, week) => cells[week * 7 + weekday] ?? transparentWidgetCell(props)
      )
    );
  }

  const rows: HeatmapWidgetCell[][] = [];
  for (let index = 0; index < cells.length; index += columns) {
    const row = cells.slice(index, index + columns);
    while (row.length < columns) {
      row.push(transparentWidgetCell(props));
    }
    rows.push(row);
  }
  return rows;
}

export function parseHeatmapWidgetList(value?: string): string[] {
  return typeof value === 'string' ? value.split(',') : [];
}

function transparentWidgetCell(props: HeatmapWidgetProps): HeatmapWidgetCell {
  return {
    color: TRANSPARENT_CELL,
    label: '',
    labelColor: props.weekdayLabelColor,
  };
}

function defaultHeatmapWidgetTitle(variant: HeatmapWidgetVariant): string {
  switch (variant) {
    case 'week':
      return '지난 7일';
    case 'month':
      return '지난 30일';
    case 'year':
      return '지난 6개월';
  }
}

function dayOfMonthLabel(dateKey: string): string {
  const [, , day] = dateKey.split('-');
  return day ? String(Number(day)) : '';
}

function heatmapLabelColor(colors: ThemeColors, bucket: number): string {
  if (bucket >= 3) {
    return colors.accentText;
  }
  return colors.tx3;
}

function heatmapCellColor(colors: ThemeColors, cell: HeatmapCellInput): string {
  return cell.isGap ? TRANSPARENT_CELL : heatColor(colors, cell.bucket, true);
}

function heatmapCellLabelColor(colors: ThemeColors, cell: HeatmapCellInput): string {
  return cell.isGap ? colors.tx3 : heatmapLabelColor(colors, cell.bucket);
}

function buildRecentMonthCells(cells: HeatmapCellInput[], months: number): HeatmapCellInput[] {
  const latestCell = [...cells].reverse().find((cell) => cell.dateKey);
  if (!latestCell) {
    return cells;
  }

  const latestDate = dateFromKey(latestCell.dateKey);
  const rangeStart = new Date(latestDate.getFullYear(), latestDate.getMonth() - months + 1, 1);
  const gridStart = new Date(rangeStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  // Keep one continuous GitHub-style date stream. Months do not restart their
  // own grids; renderers only add a one-cell horizontal gap at explicit month
  // gap markers.
  const byDateKey = new Map(cells.map((cell) => [cell.dateKey, cell]));
  const result: HeatmapCellInput[] = [];
  for (
    let cursor = new Date(gridStart);
    cursor.getTime() <= latestDate.getTime();
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const dateKey = keyFromDate(cursor);
    const source = byDateKey.get(dateKey);
    result.push({
      dateKey,
      bucket: source?.bucket ?? 0,
      inRange: cursor.getTime() >= rangeStart.getTime(),
    });
  }
  return result;
}

function insertMonthTransitionGapCells(cells: HeatmapCellInput[]): HeatmapCellInput[] {
  const result: HeatmapCellInput[] = [];
  let hasSeenFirstInRangeMonth = false;

  for (const cell of cells) {
    const isInRangeMonthStart =
      !cell.isGap && (cell.inRange ?? true) && Number(cell.dateKey.split('-')[2]) === 1;

    if (isInRangeMonthStart) {
      if (hasSeenFirstInRangeMonth) {
        result.push(...monthTransitionGapCells());
      } else {
        hasSeenFirstInRangeMonth = true;
      }
    }

    result.push(cell);
  }

  return result;
}

function monthTransitionGapCells(): HeatmapCellInput[] {
  return Array.from({ length: 7 }, () => ({
    dateKey: '',
    bucket: 0,
    isGap: true,
  }));
}

function buildWeekMonthLabels(cells: HeatmapCellInput[]): string[] {
  const weekCount = Math.ceil(cells.length / 7);
  const labels = Array.from({ length: weekCount }, () => '');

  for (let week = 0; week < weekCount; week += 1) {
    const weekCells = cells.slice(week * 7, week * 7 + 7);
    const monthStartIndex = weekCells.findIndex(
      (cell) => !cell.isGap && (cell.inRange ?? true) && Number(cell.dateKey.split('-')[2]) === 1
    );
    if (monthStartIndex < 0) {
      continue;
    }

    const month = Number(weekCells[monthStartIndex].dateKey.split('-')[1]);
    if (!month) {
      continue;
    }

    const labelWeek = monthStartIndex === 0 || week + 1 >= weekCount ? week : week + 1;
    labels[labelWeek] = `${month}월`;
  }

  return labels;
}

function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function keyFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
