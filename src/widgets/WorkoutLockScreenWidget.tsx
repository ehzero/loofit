import { Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundColor, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

import type { WorkoutLockScreenWidgetProps } from './types';

// The production iOS lock-screen widget is rendered by native SwiftUI in
// ios/ExpoWidgetsTarget. This fallback only lets JS publish timeline props
// through expo-widgets.
function WorkoutLockScreenFallbackView(props: WorkoutLockScreenWidgetProps) {
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
          key="title"
          modifiers={[
            font({ size: 13, weight: 'heavy' }),
            foregroundColor(props.titleColor || '#F4F4F2'),
          ]}>
          {props.rectangularTitle || props.circularValue}
        </Text>,
      ]}
    </VStack>
  );
}

export const WorkoutLockScreenWidget = createWidget<WorkoutLockScreenWidgetProps>(
  'WorkoutLockScreenWidget',
  WorkoutLockScreenFallbackView
);
