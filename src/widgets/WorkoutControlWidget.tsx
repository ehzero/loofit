import { Button, Text, VStack } from '@expo/ui/swift-ui';
import { createWidget } from 'expo-widgets';

import type { WorkoutControlWidgetProps } from './types';

function WorkoutControlWidgetView(props: WorkoutControlWidgetProps) {
  'widget';

  const buttonLabel = props.state === 'active' ? '운동 종료' : '운동 시작';
  const target = props.state === 'active' ? 'end-active' : 'start-recommended';

  return (
    <VStack alignment="leading" spacing={8}>
      <Text>{props.state === 'completed' ? '오늘 운동 완료' : 'Loofit'}</Text>
      <Text>{props.title}</Text>
      <Text>{props.subtitle}</Text>
      <Text>{props.durationLabel}</Text>
      {props.state !== 'completed' ? <Button label={buttonLabel} target={target} /> : null}
    </VStack>
  );
}

export const WorkoutControlWidget = createWidget<WorkoutControlWidgetProps>(
  'WorkoutControlWidget',
  WorkoutControlWidgetView
);

export default WorkoutControlWidget;
