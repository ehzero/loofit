import { HStack, Text, VStack } from '@expo/ui/swift-ui';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { HeatmapCalendarWidgetProps } from './types';

function HeatmapCalendarWidgetView(
  props: HeatmapCalendarWidgetProps,
  environment: WidgetEnvironment
) {
  'widget';

  const count = environment.widgetFamily === 'systemSmall' ? 7 : 30;
  const days = props.days.slice(-count);

  return (
    <VStack alignment="leading" spacing={6}>
      <Text>{count}일 운동 히트맵</Text>
      <HStack spacing={3}>
        {days.map((day) => (
          <Text key={day.dateKey}>
            {day.bucket >= 4
              ? '█'
              : day.bucket === 3
                ? '▆'
                : day.bucket === 2
                  ? '▄'
                  : day.bucket === 1
                    ? '▂'
                    : '·'}
          </Text>
        ))}
      </HStack>
      <Text>{days.filter((day) => day.bucket > 0).length}회 운동</Text>
    </VStack>
  );
}

export const HeatmapCalendarWidget = createWidget<HeatmapCalendarWidgetProps>(
  'HeatmapCalendarWidget',
  HeatmapCalendarWidgetView
);

export default HeatmapCalendarWidget;
