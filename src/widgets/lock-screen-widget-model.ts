import { BRAND } from '@/src/config/brand';
import type { HeatmapDay } from '@/src/types';
import type { ThemeColors } from '@/src/theme/tokens';

import type {
  WorkoutLockScreenCalendarWidgetProps,
  WorkoutLockScreenWidgetProps,
} from './types';
import { widgetColor } from './widget-design-system';
import { WIDGET_RENDERER_CONTRACT } from './widget-spec';

const LOCK_SCREEN = WIDGET_RENDERER_CONTRACT.lockScreen;

type LockScreenThemeProps = Pick<
  WorkoutLockScreenWidgetProps,
  'accent' | 'background' | 'titleColor' | 'detailColor'
>;

type WorkoutLockScreenDisplayInput = {
  state: WorkoutLockScreenWidgetProps['state'];
  title: string;
  detail?: string;
  durationLabel?: string;
  startedAt?: string;
  now?: Date;
} & LockScreenThemeProps;

export function buildWorkoutLockScreenProps(
  input: WorkoutLockScreenDisplayInput
): WorkoutLockScreenWidgetProps {
  const title = normalizeText(input.title) || LOCK_SCREEN.copy.routineRequired;
  const detail = normalizeText(input.detail ?? '');
  const compactSource = firstPartName(detail) || firstPartName(title) || title;
  const elapsedLabel = input.startedAt
    ? formatElapsedMinuteLabel(input.startedAt, input.now ?? new Date())
    : '0분';
  const durationLabel = input.durationLabel ?? '';

  if (input.state === 'active') {
    return {
      state: 'active',
      brandName: BRAND.displayName,
      inlineText: `${BRAND.displayName} · ${LOCK_SCREEN.copy.active} ${title}`,
      circularValue: elapsedLabel,
      rectangularEyebrow: LOCK_SCREEN.copy.active,
      rectangularTitle: elapsedLabel,
      rectangularDetail: title,
      startedAt: input.startedAt,
      ...lockScreenThemeProps(input),
    };
  }

  if (input.state === 'completed') {
    const completedDetail = [title, durationLabel].filter(Boolean).join(' · ');
    return {
      state: 'completed',
      brandName: BRAND.displayName,
      inlineText: `${BRAND.displayName} · ${LOCK_SCREEN.copy.completedBadge} ${title}`,
      circularValue: LOCK_SCREEN.copy.completedBadge,
      rectangularEyebrow: LOCK_SCREEN.copy.completedEyebrow,
      rectangularTitle: LOCK_SCREEN.copy.completedBadge,
      rectangularDetail: completedDetail,
      ...lockScreenThemeProps(input),
    };
  }

  return {
    state: 'idle',
    brandName: BRAND.displayName,
    inlineText: `${BRAND.displayName} · ${LOCK_SCREEN.copy.idle} ${title}`,
    circularValue: compactAccessoryValue(compactSource),
    rectangularEyebrow: LOCK_SCREEN.copy.idle,
    rectangularTitle: title,
    rectangularDetail: detail,
    ...lockScreenThemeProps(input),
  };
}

export function buildWorkoutLockScreenCalendarFromCells({
  cells,
  todayDateKey,
}: {
  cells: Array<Pick<HeatmapDay, 'bucket' | 'dateKey'>>;
  todayDateKey: string;
}): WorkoutLockScreenCalendarWidgetProps {
  const calendar = LOCK_SCREEN.threeWeekCalendar;
  const cellCount = calendar.rangeWeeks * calendar.columns;
  const recentCells = cells.slice(-cellCount);
  const missingCellCount = Math.max(0, cellCount - recentCells.length);

  return {
    weekdayLabels: WIDGET_RENDERER_CONTRACT.heatmap.weekdayLabels.join(','),
    dateLabels: [
      ...Array.from({ length: missingCellCount }, () => ''),
      ...recentCells.map((cell) => dayOfMonth(cell.dateKey)),
    ].join(','),
    heatLevels: [
      ...Array.from({ length: missingCellCount }, () => '0'),
      ...recentCells.map((cell) => String(Math.min(4, Math.max(0, cell.bucket)))),
    ].join(','),
    todayFlags: [
      ...Array.from({ length: missingCellCount }, () => '0'),
      ...recentCells.map((cell) => (cell.dateKey === todayDateKey ? '1' : '0')),
    ].join(','),
  };
}

export function lockScreenThemeFromColors(colors: ThemeColors): LockScreenThemeProps {
  return {
    accent: widgetColor(colors, 'accent'),
    background: widgetColor(colors, 'raisedSurface'),
    titleColor: widgetColor(colors, 'textHigh'),
    detailColor: widgetColor(colors, 'textMedium'),
  };
}

function lockScreenThemeProps(input: LockScreenThemeProps): LockScreenThemeProps {
  return {
    accent: input.accent,
    background: input.background,
    titleColor: input.titleColor,
    detailColor: input.detailColor,
  };
}

function compactAccessoryValue(value: string): string {
  return [...value.replace(/\s+/g, '')].slice(0, LOCK_SCREEN.compactCharacterLimit).join('');
}

function firstPartName(value: string): string {
  return value.split(' · ').find(Boolean) ?? '';
}

function normalizeText(value: string): string {
  return value.trim();
}

function formatElapsedMinuteLabel(startedAt: string, now: Date): string {
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) {
    return '0분';
  }
  const minutes = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 60000));
  return `${minutes}분`;
}

function dayOfMonth(dateKey: string): string {
  const day = Number(dateKey.split('-')[2]);
  return Number.isFinite(day) && day > 0 ? String(day) : '';
}
