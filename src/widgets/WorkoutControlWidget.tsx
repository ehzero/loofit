import { Button, HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  containerBackground,
  font,
  foregroundColor,
  monospacedDigit,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

import type { WorkoutControlWidgetProps } from './types';

function WorkoutControlWidgetView(props: WorkoutControlWidgetProps) {
  'widget';

  // The 'widget' directive extracts this function into an isolated JS
  // context — module-scope values are NOT visible here, so every constant
  // must live inside the function body.
  // Tokens mirror the in-app widget preview (app/widgets.tsx): fixed dark card.
  const BG = '#141418';
  const TX = '#F4F4F2';
  const TX3 = '#8A8A90';
  const TX4 = '#6B6B70';
  const DARK_BUTTON = '#26262B';
  const TIMER_MAX_HOURS = 8;

  const accent = props.accent ?? '#CFF56A';
  const isActive = props.state === 'active';
  const headerLabel =
    props.state === 'idle' ? '다음 운동' : isActive ? '운동 중' : '오늘 운동 완료';
  const startedAt = props.startedAt ? new Date(props.startedAt) : new Date();

  return (
    <VStack alignment="leading" spacing={8} modifiers={[containerBackground(BG, 'widget')]}>
      <HStack spacing={4}>
        <Text
          modifiers={[
            font({ size: 11, weight: 'heavy' }),
            foregroundColor(isActive ? accent : TX3),
          ]}>
          {headerLabel}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundColor(TX4)]}>
          LOOFIT
        </Text>
      </HStack>

      {isActive ? (
        <Text
          timerInterval={{
            lower: startedAt,
            upper: new Date(startedAt.getTime() + TIMER_MAX_HOURS * 3600 * 1000),
          }}
          countsDown={false}
          modifiers={[font({ size: 30, weight: 'heavy' }), monospacedDigit(), foregroundColor(TX)]}
        />
      ) : (
        <Text modifiers={[font({ size: 24, weight: 'heavy' }), foregroundColor(TX)]}>
          {props.title}
        </Text>
      )}

      {/* Completed: total duration first and large, time range beneath it. */}
      {props.state === 'completed' ? (
        <Text modifiers={[font({ size: 22, weight: 'heavy' }), foregroundColor(accent)]}>
          {props.durationLabel}
        </Text>
      ) : null}
      {props.subtitle ? (
        <Text
          modifiers={[
            font({ size: props.state === 'completed' ? 11 : 12, weight: 'semibold' }),
            foregroundColor(TX3),
          ]}>
          {props.subtitle}
        </Text>
      ) : null}

      {props.state !== 'completed' ? (
        <Button
          label={isActive ? '운동 종료' : '운동 시작'}
          target={isActive ? 'end-active' : 'start-recommended'}
          modifiers={[
            buttonStyle('borderedProminent'),
            tint(isActive ? DARK_BUTTON : accent),
          ]}
        />
      ) : null}
    </VStack>
  );
}

export const WorkoutControlWidget = createWidget<WorkoutControlWidgetProps>(
  'WorkoutControlWidget',
  WorkoutControlWidgetView
);

export default WorkoutControlWidget;
