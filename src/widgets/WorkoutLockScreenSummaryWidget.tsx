import { Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundColor, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

import type { WorkoutLockScreenSummaryWidgetProps } from './types';

// The production iOS lock-screen summary widget is rendered by native SwiftUI
// in ios/ExpoWidgetsTarget. This fallback only lets JS publish timeline props.
function WorkoutLockScreenSummaryFallbackView(props: WorkoutLockScreenSummaryWidgetProps) {
  'widget';

  return (
    <VStack
      alignment="leading"
      spacing={4}
      modifiers={[
        padding({ all: 8 }),
        containerBackground(props.background || '#1B1B1F', 'widget'),
      ]}>
      {[
        <Text
          key="summary"
          modifiers={[
            font({ size: 11, weight: 'heavy' }),
            foregroundColor(props.titleColor || '#F4F4F2'),
          ]}>
          {props.summaryText}
        </Text>,
      ]}
    </VStack>
  );
}

export const WorkoutLockScreenSummaryWidget =
  createWidget<WorkoutLockScreenSummaryWidgetProps>(
    'WorkoutLockScreenSummaryWidget',
    WorkoutLockScreenSummaryFallbackView
  );
