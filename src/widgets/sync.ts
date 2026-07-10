import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { after, type LiveActivity } from 'expo-widgets';

import { getAppSetting } from '@/src/db/repository';
import { formatClock, formatDuration, getEndOfLocalDay } from '@/src/domain/date';
import { hasRoutineDayAlias, routineDayDisplayName } from '@/src/domain/routine';
import { accentTextFor, DEFAULT_ACCENT, heatColor, makeColors } from '@/src/theme/tokens';
import type { AppOverview, WorkoutSession } from '@/src/types';

import type { WorkoutControlWidgetProps, WorkoutLiveActivityProps } from './types';

// Must match the widget views' dark card background so out-of-range heatmap
// cells disappear into it.
const WIDGET_BG = '#141418';

let liveActivity: LiveActivity<WorkoutLiveActivityProps> | null = null;

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

  const accent = (await getAppSetting('theme_accent').catch(() => null)) ?? DEFAULT_ACCENT;
  const accentText = accentTextFor(accent);

  WorkoutControlWidget.updateTimeline([
    {
      date: new Date(),
      props: buildWorkoutControlProps(overview, accent, accentText),
    },
    {
      date: getTomorrowStart(),
      props: buildIdleControlProps(overview, accent, accentText),
    },
  ]);

  const darkColors = makeColors('dark', accent);
  const gridColors = (cells: Array<{ bucket: number; inRange: boolean }>) =>
    cells
      .map((cell) => (cell.inRange ? heatColor(darkColors, cell.bucket) : WIDGET_BG))
      .join(',');

  HeatmapWeekWidget.updateSnapshot({
    colors: overview.heatmap7.map((day) => heatColor(darkColors, day.bucket)).join(','),
  });
  HeatmapMonthWidget.updateSnapshot({ colors: gridColors(overview.heatmapGrid) });
  HeatmapYearWidget.updateSnapshot({ colors: gridColors(overview.heatmapYear) });

  await syncLiveActivity(overview, WorkoutLiveActivity, accent);
}

function areWidgetsEnabled(): boolean {
  return Platform.OS === 'ios' && Constants.expoConfig?.extra?.widgetsEnabled === true;
}

function joinParts(session: WorkoutSession): string {
  return session.parts.map((part) => part.bodyPartName).join(' · ');
}

function buildWorkoutControlProps(
  overview: AppOverview,
  accent: string,
  accentText: string
): WorkoutControlWidgetProps {
  if (overview.activeSession) {
    const parts = joinParts(overview.activeSession);
    return {
      state: 'active',
      title: parts,
      subtitle: parts,
      durationLabel: '',
      startedAt: overview.activeSession.startedAt,
      accent,
      accentText,
    };
  }

  if (overview.todaySessions.length > 0) {
    const parts = [
      ...new Set(
        overview.todaySessions.flatMap((session) =>
          session.parts.map((part) => part.bodyPartName)
        )
      ),
    ].join(' · ');
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
      title: parts,
      subtitle: `${formatClock(first.startedAt)} – ${formatClock(last.endedAt ?? last.startedAt)}`,
      durationLabel: formatDuration(totalSeconds),
      accent,
      accentText,
    };
  }

  return buildIdleControlProps(overview, accent, accentText);
}

function buildIdleControlProps(
  overview: AppOverview,
  accent: string,
  accentText: string
): WorkoutControlWidgetProps {
  const nextDay = overview.nextRoutineDay;
  return {
    state: 'idle',
    title: nextDay ? routineDayDisplayName(nextDay) : '루틴 설정 필요',
    // Without an alias the title already lists the parts — don't repeat them.
    subtitle: nextDay
      ? hasRoutineDayAlias(nextDay)
        ? nextDay.parts.map((part) => part.name).join(' · ')
        : ''
      : '앱에서 첫 루틴을 설정하세요',
    durationLabel: '',
    accent,
    accentText,
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
  accent: string
): Promise<void> {
  if (overview.activeSession) {
    const props: WorkoutLiveActivityProps = {
      title: joinParts(overview.activeSession),
      subtitle: '루핏 운동 중',
      startedAt: overview.activeSession.startedAt,
      accent,
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
