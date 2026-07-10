import { Appearance, Platform } from 'react-native';
import Constants from 'expo-constants';
import { after, type LiveActivity } from 'expo-widgets';

import { BRAND } from '@/src/config/brand';
import { getAppSetting } from '@/src/db/repository';
import { formatClock, formatDuration, getEndOfLocalDay } from '@/src/domain/date';
import { hasRoutineDayAlias, routineDayDisplayName } from '@/src/domain/routine';
import {
  DEFAULT_ACCENT,
  makeColors,
  type ThemeColors,
  type ThemeMode,
  type ThemeScheme,
} from '@/src/theme/tokens';
import type { AppOverview, WorkoutSession } from '@/src/types';
import {
  buildHeatmapWidgetProps,
  buildWeekHeatmapFooterProps,
  formatHeatmapWidgetTitle,
  formatSixMonthHeatmapWidgetTitle,
} from '@/src/widgets/heatmap-widget-model';

import type { WorkoutControlWidgetProps, WorkoutLiveActivityProps } from './types';

let liveActivity: LiveActivity<WorkoutLiveActivityProps> | null = null;
const THEME_MODE_KEY = 'theme_mode';
const THEME_ACCENT_KEY = 'theme_accent';

export async function syncWidgetsFromOverview(overview: AppOverview): Promise<void> {
  if (!areWidgetsEnabled()) {
    return;
  }

  const [
    { WorkoutControlWidget },
    { HeatmapWeekWidget, HeatmapMonthWidget, HeatmapYearWidget },
    { WorkoutLiveActivity },
  ] = await Promise.all([
    import('./WorkoutControlWidget'),
    import('./HeatmapCalendarWidget'),
    import('./WorkoutLiveActivity'),
  ]);

  const widgetColors = await getWidgetThemeColors();

  WorkoutControlWidget.updateTimeline([
    {
      date: new Date(),
      props: buildWorkoutControlProps(overview, widgetColors),
    },
    {
      date: getTomorrowStart(),
      props: buildIdleControlProps(overview, widgetColors),
    },
  ]);

  HeatmapWeekWidget.updateSnapshot(
    buildHeatmapWidgetProps({
      title: formatHeatmapWidgetTitle('지난 7일', overview.rangeStats.last7.workoutCount),
      variant: 'week',
      cells: overview.heatmap7,
      colors: widgetColors,
      footer: buildWeekHeatmapFooterProps({
        stats: overview.rangeStats.last7,
        recentSessions: overview.recentSessions,
        routineDays: overview.routineDays,
      }),
    })
  );
  HeatmapMonthWidget.updateSnapshot(
    buildHeatmapWidgetProps({
      title: formatHeatmapWidgetTitle('지난 30일', overview.rangeStats.last30.workoutCount),
      variant: 'month',
      cells: overview.heatmapGrid,
      colors: widgetColors,
    })
  );
  HeatmapYearWidget.updateSnapshot(
    buildHeatmapWidgetProps({
      title: formatSixMonthHeatmapWidgetTitle(overview.rangeStats.last6Months),
      variant: 'year',
      cells: overview.heatmapYear,
      colors: widgetColors,
    })
  );

  await syncLiveActivity(overview, WorkoutLiveActivity, widgetColors);
}

function areWidgetsEnabled(): boolean {
  return Platform.OS === 'ios' && Constants.expoConfig?.extra?.widgetsEnabled === true;
}

function joinParts(session: WorkoutSession): string {
  return session.parts.map((part) => part.bodyPartName).join(' · ');
}

function routineSessionTitle(
  session: WorkoutSession,
  routineDays: AppOverview['routineDays']
): string {
  const routineDay = session.routineDayId
    ? routineDays.find((day) => day.id === session.routineDayId)
    : null;
  return routineDay ? routineDayDisplayName(routineDay) : joinParts(session);
}

function uniqueJoined(values: string[]): string {
  return [...new Set(values.filter(Boolean))].join(' · ');
}

async function getWidgetThemeColors(): Promise<ThemeColors> {
  const [savedMode, savedAccent] = await Promise.all([
    getAppSetting(THEME_MODE_KEY).catch(() => null),
    getAppSetting(THEME_ACCENT_KEY).catch(() => null),
  ]);
  const mode = isThemeMode(savedMode) ? savedMode : 'system';
  const accent = savedAccent || DEFAULT_ACCENT;
  return makeColors(resolveThemeScheme(mode), accent);
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'dark' || value === 'light';
}

function resolveThemeScheme(mode: ThemeMode): ThemeScheme {
  if (mode !== 'system') {
    return mode;
  }
  return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
}

function workoutControlThemeProps(colors: ThemeColors): Pick<
  WorkoutControlWidgetProps,
  | 'background'
  | 'labelColor'
  | 'brandColor'
  | 'titleColor'
  | 'detailColor'
  | 'secondaryButtonBackground'
  | 'secondaryButtonText'
> {
  return {
    background: colors.card,
    labelColor: colors.tx3,
    brandColor: colors.tx5,
    titleColor: colors.tx,
    detailColor: colors.tx3,
    secondaryButtonBackground: colors.surface2,
    secondaryButtonText: colors.tx,
  };
}

function buildWorkoutControlProps(
  overview: AppOverview,
  colors: ThemeColors
): WorkoutControlWidgetProps {
  const themeProps = workoutControlThemeProps(colors);
  if (overview.activeSession) {
    const parts = joinParts(overview.activeSession);
    return {
      state: 'active',
      brandName: BRAND.displayName,
      ...themeProps,
      title: parts,
      detail: '',
      subtitle: parts,
      durationLabel: '',
      startedAt: overview.activeSession.startedAt,
      accent: colors.accent,
      accentText: colors.accentText,
    };
  }

  if (overview.todaySessions.length > 0) {
    const title = uniqueJoined(
      overview.todaySessions.map((session) => routineSessionTitle(session, overview.routineDays))
    );
    const parts = uniqueJoined(
      overview.todaySessions.flatMap((session) =>
        session.parts.map((part) => part.bodyPartName)
      )
    );
    const totalSeconds = overview.todaySessions.reduce(
      (sum, session) => sum + session.durationSeconds,
      0
    );
    const ordered = [...overview.todaySessions].sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    );
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    return {
      state: 'completed',
      brandName: BRAND.displayName,
      ...themeProps,
      title,
      detail: title === parts ? '' : parts,
      subtitle: `${formatClock(first.startedAt)} – ${formatClock(last.endedAt ?? last.startedAt)}`,
      durationLabel: formatDuration(totalSeconds),
      accent: colors.accent,
      accentText: colors.accentText,
    };
  }

  return buildIdleControlProps(overview, colors);
}

function buildIdleControlProps(
  overview: AppOverview,
  colors: ThemeColors
): WorkoutControlWidgetProps {
  const nextDay = overview.nextRoutineDay;
  const title = nextDay ? routineDayDisplayName(nextDay) : '루틴 설정 필요';
  const parts = nextDay ? nextDay.parts.map((part) => part.name).join(' · ') : '';
  return {
    state: 'idle',
    brandName: BRAND.displayName,
    ...workoutControlThemeProps(colors),
    title,
    detail: nextDay && hasRoutineDayAlias(nextDay) ? parts : '',
    subtitle: nextDay ? '' : '앱에서 첫 루틴을 설정하세요',
    durationLabel: '',
    accent: colors.accent,
    accentText: colors.accentText,
  };
}

function getTomorrowStart(): Date {
  const tomorrow = getEndOfLocalDay(new Date());
  tomorrow.setMilliseconds(tomorrow.getMilliseconds() + 1);
  return tomorrow;
}

async function syncLiveActivity(
  overview: AppOverview,
  WorkoutLiveActivity: typeof import('./WorkoutLiveActivity').WorkoutLiveActivity,
  colors: ThemeColors
): Promise<void> {
  if (overview.activeSession) {
    const props: WorkoutLiveActivityProps = {
      title: joinParts(overview.activeSession),
      subtitle: `${BRAND.displayName} 운동 중`,
      startedAt: overview.activeSession.startedAt,
      accent: colors.accent,
      background: colors.card,
      titleColor: colors.tx,
    };
    const instances = WorkoutLiveActivity.getInstances();
    const activeInstance = instances[0] ?? liveActivity;
    if (activeInstance) {
      liveActivity = activeInstance;
      await activeInstance.update(props);
      return;
    }
    // The workout-in-progress UI lives on the home screen (there is no
    // dedicated /session route), so the Live Activity links to the app root.
    liveActivity = WorkoutLiveActivity.start(props, 'loofit://');
    return;
  }

  const instances = WorkoutLiveActivity.getInstances();
  const dismissAt = new Date(Date.now() + 15 * 60 * 1000);
  for (const instance of instances) {
    await instance.end(after(dismissAt), undefined, new Date());
  }
  liveActivity = null;
}
