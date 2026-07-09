import { Text, VStack } from '@expo/ui/swift-ui';
import { createLiveActivity } from 'expo-widgets';

import type { WorkoutLiveActivityProps } from './types';

function WorkoutLiveActivityView(props: WorkoutLiveActivityProps) {
  'widget';

  const startedAt = new Date(props.startedAt);

  return {
    banner: (
      <VStack alignment="leading" spacing={4}>
        <Text>운동 중</Text>
        <Text>{props.title}</Text>
        <Text timerInterval={{ lower: startedAt, upper: new Date(startedAt.getTime() + 12 * 60 * 60 * 1000) }} countsDown={false} />
      </VStack>
    ),
    compactLeading: <Text>운동</Text>,
    compactTrailing: <Text>{props.title}</Text>,
    minimal: <Text>운동</Text>,
    expandedBottom: (
      <VStack alignment="leading" spacing={4}>
        <Text>{props.subtitle}</Text>
        <Text timerInterval={{ lower: startedAt, upper: new Date(startedAt.getTime() + 12 * 60 * 60 * 1000) }} countsDown={false} />
      </VStack>
    ),
  };
}

export const WorkoutLiveActivity = createLiveActivity<WorkoutLiveActivityProps>(
  'WorkoutLiveActivity',
  WorkoutLiveActivityView
);

export default WorkoutLiveActivity;
