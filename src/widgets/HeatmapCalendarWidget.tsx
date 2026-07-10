import { Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundColor, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

import type { HeatmapWidgetProps } from './types';

// iOS heatmap widgets are rendered by native SwiftUI generated from
// plugins/with-loofit-heatmap-widgets.js. These JS widget definitions are kept
// only so the app can publish timeline snapshot props through expo-widgets.
function HeatmapTimelineFallbackView(props: HeatmapWidgetProps) {
  'widget';

  const background = props.background || '#141418';
  const titleColor = props.titleColor || '#8A8A90';

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[padding({ all: props.contentPadding || 16 }), containerBackground(background, 'widget')]}>
      {[
        <Text key="label" modifiers={[font({ size: 11, weight: 'heavy' }), foregroundColor(titleColor)]}>
          LOOFIT
        </Text>,
      ]}
    </VStack>
  );
}

export const HeatmapWeekWidget = createWidget<HeatmapWidgetProps>(
  'HeatmapWeekWidget',
  HeatmapTimelineFallbackView
);

export const HeatmapMonthWidget = createWidget<HeatmapWidgetProps>(
  'HeatmapMonthWidget',
  HeatmapTimelineFallbackView
);

export const HeatmapYearWidget = createWidget<HeatmapWidgetProps>(
  'HeatmapYearWidget',
  HeatmapTimelineFallbackView
);
