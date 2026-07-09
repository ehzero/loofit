import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { after, type LiveActivity } from 'expo-widgets';

import { formatDuration, getEndOfLocalDay } from '@/src/domain/date';
import { joinPartNames } from '@/src/domain/routine';
import type { AppOverview } from '@/src/types';

import type { WorkoutControlWidgetProps, WorkoutLiveActivityProps } from './types';

let liveActivity: LiveActivity<WorkoutLiveActivityProps> | null = null;

export async function syncWidgetsFromOverview(overview: AppOverview): Promise<void> {
  if (!areWidgetsEnabled()) {
    return;
  }

  const [{ WorkoutControlWidget }, { HeatmapCalendarWidget }, { WorkoutLiveActivity }] =
    await Promise.all([
      import('./WorkoutControlWidget'),
      import('./HeatmapCalendarWidget'),
      import('./WorkoutLiveActivity'),
    ]);

  const controlProps = buildWorkoutControlProps(overview);
  WorkoutControlWidget.updateTimeline([
    {
      date: new Date(),
      props: controlProps,
    },
    {
      date: getTomorrowStart(),
      props: buildIdleControlProps(overview),
    },
  ]);
  HeatmapCalendarWidget.updateSnapshot({ days: overview.heatmap30 });
  await syncLiveActivity(overview, WorkoutLiveActivity);
}

function areWidgetsEnabled(): boolean {
  return Platform.OS === 'ios' && Constants.expoConfig?.extra?.widgetsEnabled === true;
}

function buildWorkoutControlProps(overview: AppOverview): WorkoutControlWidgetProps {
  if (overview.activeSession) {
    return {
      state: 'active',
      title: joinPartNames(
        overview.activeSession.parts.map((part) => ({
          name: part.bodyPartName,
        }))
      ),
      subtitle: '운동 중',
      durationLabel: '진행 중',
      startedAt: overview.activeSession.startedAt,
    };
  }

  if (overview.latestCompletedToday) {
    return {
      state: 'completed',
      title: joinPartNames(
        overview.latestCompletedToday.parts.map((part) => ({
          name: part.bodyPartName,
        }))
      ),
      subtitle: '오늘 운동 완료',
      durationLabel: formatDuration(overview.latestCompletedToday.durationSeconds),
    };
  }

  return buildIdleControlProps(overview);
}

function buildIdleControlProps(overview: AppOverview): WorkoutControlWidgetProps {
  return {
    state: 'idle',
    title: overview.nextRoutineDay?.name ?? '루틴 설정 필요',
    subtitle: overview.nextRoutineDay
      ? joinPartNames(overview.nextRoutineDay.parts)
      : '앱에서 첫 루틴을 설정하세요',
    durationLabel: '바로 시작',
  };
}

function getTomorrowStart(): Date {
  const tomorrow = getEndOfLocalDay(new Date());
  tomorrow.setMilliseconds(tomorrow.getMilliseconds() + 1);
  return tomorrow;
}

async function syncLiveActivity(
  overview: AppOverview,
  WorkoutLiveActivity: typeof import('./WorkoutLiveActivity').WorkoutLiveActivity
): Promise<void> {
  if (overview.activeSession) {
    const props: WorkoutLiveActivityProps = {
      title: joinPartNames(
        overview.activeSession.parts.map((part) => ({
          name: part.bodyPartName,
        }))
      ),
      subtitle: 'Loofit 운동 중',
      startedAt: overview.activeSession.startedAt,
    };
    const instances = WorkoutLiveActivity.getInstances();
    const activeInstance = instances[0] ?? liveActivity;
    if (activeInstance) {
      liveActivity = activeInstance;
      await activeInstance.update(props);
      return;
    }
    liveActivity = WorkoutLiveActivity.start(props, 'loofit://session');
    return;
  }

  const instances = WorkoutLiveActivity.getInstances();
  const dismissAt = new Date(Date.now() + 15 * 60 * 1000);
  for (const instance of instances) {
    await instance.end(after(dismissAt), undefined, new Date());
  }
  liveActivity = null;
}
