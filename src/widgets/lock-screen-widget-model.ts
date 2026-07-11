import { BRAND } from '@/src/config/brand';
import { formatDuration } from '@/src/domain/date';
import type { HeatmapDay } from '@/src/types';
import type { ThemeColors } from '@/src/theme/tokens';

import type { WorkoutLockScreenSummaryWidgetProps, WorkoutLockScreenWidgetProps } from './types';

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
  const title = normalizeText(input.title) || '루틴 설정 필요';
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
      inlineText: `${BRAND.displayName} · 운동 중 ${title}`,
      circularValue: elapsedLabel,
      rectangularEyebrow: '운동 중',
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
      inlineText: `${BRAND.displayName} · 오운완 ${title}`,
      circularValue: '오운완',
      rectangularEyebrow: '오늘 완료',
      rectangularTitle: '오운완',
      rectangularDetail: completedDetail,
      ...lockScreenThemeProps(input),
    };
  }

  return {
    state: 'idle',
    brandName: BRAND.displayName,
    inlineText: `${BRAND.displayName} · 다음 운동 ${title}`,
    circularValue: compactAccessoryValue(compactSource),
    rectangularEyebrow: '다음 운동',
    rectangularTitle: title,
    rectangularDetail: detail,
    ...lockScreenThemeProps(input),
  };
}

export function buildWorkoutLockScreenSummaryFromCells({
  cells,
  colors,
  durationSeconds,
  workoutCount,
}: {
  cells: HeatmapDay[];
  colors: ThemeColors;
  durationSeconds: number;
  workoutCount: number;
}): WorkoutLockScreenSummaryWidgetProps {
  const recentCells = cells.slice(-7);
  const paddedCells = [
    ...Array.from({ length: Math.max(0, 7 - recentCells.length) }, () => false),
    ...recentCells.map((cell) => cell.durationSeconds > 0),
  ].slice(-7);

  return {
    brandName: BRAND.displayName,
    title: '최근 7일',
    streakFlags: paddedCells.map((active) => (active ? '1' : '0')).join(','),
    summaryText: `${workoutCount}회 · 총 ${formatDuration(durationSeconds)}`,
    accent: colors.accent,
    background: colors.surface2,
    titleColor: colors.tx,
    detailColor: colors.tx3,
  };
}

export function lockScreenThemeFromColors(colors: ThemeColors): LockScreenThemeProps {
  return {
    accent: colors.accent,
    background: colors.surface2,
    titleColor: colors.tx,
    detailColor: colors.tx3,
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
  return [...value.replace(/\s+/g, '')].slice(0, 3).join('');
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
