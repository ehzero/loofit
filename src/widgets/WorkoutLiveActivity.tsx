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
  const DEFAULT_BG = '#141418';
  const DEFAULT_TX = '#F4F4F2';
  const TIMER_MAX_HOURS = 12;

  const accent = props.accent ?? '#CFF56A';
  const bg = props.background || DEFAULT_BG;
  const titleColor = props.titleColor || DEFAULT_TX;
  const startedAt = new Date(props.startedAt);
  const timerRange = {
    lower: startedAt,
    upper: new Date(startedAt.getTime() + TIMER_MAX_HOURS * 60 * 60 * 1000),
  };

  return {
    banner: (
      <VStack alignment="leading" spacing={6} modifiers={[activityBackgroundTint(bg)]}>
        <HStack spacing={4}>
          <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundColor(accent)]}>
            운동 중
          </Text>
          <Spacer />
          <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundColor(titleColor)]}>
            {props.title}
          </Text>
        </HStack>
        <Text
          timerInterval={timerRange}
          countsDown={false}
          modifiers={[font({ size: 30, weight: 'heavy' }), monospacedDigit(), foregroundColor(titleColor)]}
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
        modifiers={[font({ size: 12, weight: 'bold' }), monospacedDigit(), foregroundColor(titleColor)]}
      />
    ),
    minimal: (
      <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundColor(accent)]}>운동</Text>
    ),
    expandedBottom: (
      <HStack spacing={4}>
        <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundColor(titleColor)]}>
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
