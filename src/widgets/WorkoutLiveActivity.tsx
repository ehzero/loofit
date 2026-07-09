import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  font,
  foregroundColor,
  monospacedDigit,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

import type { WorkoutLiveActivityProps } from './types';

function WorkoutLiveActivityView(props: WorkoutLiveActivityProps) {
  'widget';

  // Constants must live inside the function body: the 'widget' directive
  // extracts it into an isolated JS context without module scope.
  // Same dark-card tokens as the widgets and the in-app preview.
  const BG = '#141418';
  const TX = '#F4F4F2';
  const TIMER_MAX_HOURS = 12;

  const accent = props.accent ?? '#CFF56A';
  const startedAt = new Date(props.startedAt);
  const timerRange = {
    lower: startedAt,
    upper: new Date(startedAt.getTime() + TIMER_MAX_HOURS * 60 * 60 * 1000),
  };

  return {
    banner: (
      <VStack alignment="leading" spacing={6} modifiers={[activityBackgroundTint(BG)]}>
        <HStack spacing={4}>
          <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundColor(accent)]}>
            운동 중
          </Text>
          <Spacer />
          <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundColor(TX)]}>
            {props.title}
          </Text>
        </HStack>
        <Text
          timerInterval={timerRange}
          countsDown={false}
          modifiers={[font({ size: 30, weight: 'heavy' }), monospacedDigit(), foregroundColor(TX)]}
        />
      </VStack>
    ),
    compactLeading: (
      <Text modifiers={[font({ size: 12, weight: 'heavy' }), foregroundColor(accent)]}>운동</Text>
    ),
    compactTrailing: (
      <Text
        timerInterval={timerRange}
        countsDown={false}
        modifiers={[font({ size: 12, weight: 'bold' }), monospacedDigit(), foregroundColor(TX)]}
      />
    ),
    minimal: (
      <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundColor(accent)]}>운동</Text>
    ),
    expandedBottom: (
      <HStack spacing={4}>
        <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundColor(TX)]}>
          {props.title}
        </Text>
        <Spacer />
        <Text
          timerInterval={timerRange}
          countsDown={false}
          modifiers={[font({ size: 20, weight: 'heavy' }), monospacedDigit(), foregroundColor(accent)]}
        />
      </HStack>
    ),
  };
}

export const WorkoutLiveActivity = createLiveActivity<WorkoutLiveActivityProps>(
  'WorkoutLiveActivity',
  WorkoutLiveActivityView
);

export default WorkoutLiveActivity;
