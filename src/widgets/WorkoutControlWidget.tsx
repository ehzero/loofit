import { Button, Circle, HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  buttonStyle,
  containerBackground,
  cornerRadius,
  font,
  foregroundColor,
  frame,
  monospacedDigit,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

import type { WorkoutControlWidgetProps } from './types';

// This view must mirror the in-app widget preview (app/widgets.tsx small
// cards) exactly — sizes, colors, and layout below are kept in sync with it.
function WorkoutControlWidgetView(props: WorkoutControlWidgetProps) {
  'widget';

  // The 'widget' directive extracts this function into an isolated JS
  // context — every constant must live inside the function body, and every
  // container's children must be ONE flat array (the native parser drops
  // nested arrays silently).
  const BG = '#141418';
  const TX = '#F4F4F2';
  const TX3 = '#8A8A90';
  const TX4 = '#6B6B70';
  const DARK_BUTTON = '#26262B';
  const TIMER_MAX_HOURS = 8;

  const accent = props.accent ?? '#CFF56A';
  const accentText = props.accentText ?? '#0B0B0B';
  const isActive = props.state === 'active';
  const isCompleted = props.state === 'completed';
  const startedAt = props.startedAt ? new Date(props.startedAt) : new Date();

  // The patched native AppIntent (patches/expo-widgets) writes legacy-format
  // props when a widget button is tapped: " + " part separators and status
  // strings ("운동 중"/"오늘 운동 완료") in `subtitle` where the app-side sync
  // sends a time range. Normalize here so both sources render identically.
  const title = (props.title ?? '').split(' + ').join(' · ');
  const rawSubtitle = (props.subtitle ?? '').split(' + ').join(' · ');
  const subtitle =
    rawSubtitle === '운동 중' || rawSubtitle === '오늘 운동 완료' ? '' : rawSubtitle;
  // Native idle props use the raw day name, which is empty for alias-less
  // splits — fall back to the part list.
  const heading = title || subtitle;

  // Preview-style full-width pill CTA. The pill styling lives on the Button
  // itself — styling only the inner label leaves the button's own content
  // insets visible as side margins.
  const cta = (label: string, target: string, bg: string, fg: string) => (
    <Button
      key="cta"
      target={target}
      modifiers={[
        buttonStyle('plain'),
        frame({ maxWidth: 10000 }),
        padding({ vertical: 8 }),
        background(bg),
        cornerRadius(12),
      ]}>
      <Text modifiers={[font({ size: 13, weight: 'heavy' }), foregroundColor(fg)]}>{label}</Text>
    </Button>
  );

  const headerLeft = isActive ? (
    <HStack key="left" spacing={6}>
      {[
        <Circle
          key="dot"
          modifiers={[frame({ width: 7, height: 7 }), foregroundColor(accent)]}
        />,
        <Text key="label" modifiers={[font({ size: 11, weight: 'heavy' }), foregroundColor(accent)]}>
          운동 중
        </Text>,
      ]}
    </HStack>
  ) : (
    <Text key="left" modifiers={[font({ size: 11, weight: 'heavy' }), foregroundColor(TX3)]}>
      {isCompleted ? '오늘 운동 완료' : '다음 운동'}
    </Text>
  );

  const header = (
    <HStack key="header" spacing={4}>
      {[
        headerLeft,
        <Spacer key="spacer" />,
        <Text key="brand" modifiers={[font({ size: 10, weight: 'bold' }), foregroundColor(TX4)]}>
          LOOFIT
        </Text>,
      ]}
    </HStack>
  );

  const children = [header];

  if (isActive) {
    // Timer + parts are one tight block (spacing 4), matching the preview.
    children.push(
      <VStack key="timerBlock" alignment="leading" spacing={4}>
        {[
          <Text
            key="timer"
            timerInterval={{
              lower: startedAt,
              upper: new Date(startedAt.getTime() + TIMER_MAX_HOURS * 3600 * 1000),
            }}
            countsDown={false}
            modifiers={[
              font({ size: 26, weight: 'heavy' }),
              monospacedDigit(),
              foregroundColor(TX),
            ]}
          />,
          <Text
            key="parts"
            modifiers={[font({ size: 13, weight: 'semibold' }), foregroundColor(TX3)]}>
            {heading}
          </Text>,
        ]}
      </VStack>,
      <Spacer key="grow" />,
      cta('운동 종료', 'end-active', DARK_BUTTON, TX)
    );
  } else if (isCompleted) {
    children.push(
      <Text key="name" modifiers={[font({ size: 19, weight: 'heavy' }), foregroundColor(TX)]}>
        {heading}
      </Text>,
      <Spacer key="grow" />,
      <Text key="duration" modifiers={[font({ size: 22, weight: 'heavy' }), foregroundColor(accent)]}>
        {props.durationLabel}
      </Text>
    );
    if (subtitle) {
      children.push(
        <Text key="range" modifiers={[font({ size: 11, weight: 'semibold' }), foregroundColor(TX3)]}>
          {subtitle}
        </Text>
      );
    }
  } else {
    children.push(
      <Text key="name" modifiers={[font({ size: 19, weight: 'heavy' }), foregroundColor(TX)]}>
        {heading}
      </Text>,
      <Spacer key="grow" />,
      cta('운동 시작', 'start-recommended', accent, accentText)
    );
  }

  return (
    <VStack alignment="leading" spacing={12} modifiers={[containerBackground(BG, 'widget')]}>
      {children}
    </VStack>
  );
}

export const WorkoutControlWidget = createWidget<WorkoutControlWidgetProps>(
  'WorkoutControlWidget',
  WorkoutControlWidgetView
);

export default WorkoutControlWidget;
