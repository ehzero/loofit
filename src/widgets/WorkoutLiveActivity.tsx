import { Button, HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  background,
  buttonStyle,
  cornerRadius,
  font,
  foregroundColor,
  frame,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  offset,
  padding,
  truncationMode,
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
  const accentText = props.accentText ?? '#0B0B0B';
  const bg = props.background || DEFAULT_BG;
  const titleColor = props.titleColor || DEFAULT_TX;
  const title = (props.title || '운동').split(' + ').join(' · ');
  const parts = title.split(' · ').filter(Boolean);
  const compactTitle = parts.length > 0 ? parts.join('·') : title;
  const minimalTitle = (title.split(' · ')[0] || title).slice(0, 4);
  const startedAt = new Date(props.startedAt);
  const timerRange = {
    lower: startedAt,
    upper: new Date(startedAt.getTime() + TIMER_MAX_HOURS * 60 * 60 * 1000),
  };
  const stopButton = (width: number, height: number, textSize: number) => (
    <Button target="end-active" modifiers={[buttonStyle('plain'), frame({ width, height })]}>
      <HStack
        spacing={0}
        modifiers={[frame({ width, height }), background(accent), cornerRadius(height / 2)]}>
        {[
          <Spacer key="leading" minLength={0} />,
          <Text
            key="label"
            modifiers={[
              font({ size: textSize, weight: 'heavy' }),
              foregroundColor(accentText),
              lineLimit(1),
              minimumScaleFactor(0.8),
            ]}>
            운동 종료
          </Text>,
          <Spacer key="trailing" minLength={0} />,
        ]}
      </HStack>
    </Button>
  );

  return {
    banner: (
      <VStack
        alignment="leading"
        spacing={7}
        modifiers={[activityBackgroundTint(bg), padding({ all: 14 })]}>
        <HStack spacing={4}>
          <Text
            modifiers={[
              font({ size: 17, weight: 'heavy' }),
              foregroundColor(titleColor),
              lineLimit(1),
              minimumScaleFactor(0.78),
              truncationMode('tail'),
            ]}>
            {title}
          </Text>
          <Spacer />
          <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundColor(accent)]}>
            운동 중
          </Text>
        </HStack>
        <HStack spacing={10}>
          <Text
            timerInterval={timerRange}
            countsDown={false}
            modifiers={[
              font({ size: 32, weight: 'heavy' }),
              monospacedDigit(),
              foregroundColor(accent),
              lineLimit(1),
              minimumScaleFactor(0.78),
            ]}
          />
          <Spacer />
          {stopButton(88, 32, 13)}
        </HStack>
      </VStack>
    ),
    compactLeading: (
      <Text
        modifiers={[
          font({ size: 11, weight: 'heavy' }),
          foregroundColor(accent),
          lineLimit(1),
          minimumScaleFactor(0.55),
          frame({ width: 48, alignment: 'leading' }),
          truncationMode('tail'),
        ]}>
        {compactTitle}
      </Text>
    ),
    compactTrailing: (
      <Text
        date={startedAt}
        dateStyle="timer"
        modifiers={[
          font({ size: 11, weight: 'heavy' }),
          monospacedDigit(),
          foregroundColor(accent),
          lineLimit(1),
          minimumScaleFactor(0.68),
          frame({ width: 38, alignment: 'trailing' }),
        ]}
      />
    ),
    minimal: (
      <Text
        modifiers={[
          font({ size: 10, weight: 'heavy' }),
          foregroundColor(accent),
          lineLimit(1),
          minimumScaleFactor(0.72),
        ]}>
        {minimalTitle}
      </Text>
    ),
    expandedCenter: (
      <HStack
        spacing={7}
        modifiers={[frame({ width: 286, height: 32, alignment: 'center' }), offset({ y: -8 })]}>
        <Text
          modifiers={[
            font({ size: 14, weight: 'heavy' }),
            foregroundColor(DEFAULT_TX),
            lineLimit(1),
            minimumScaleFactor(0.76),
            frame({ width: 124, height: 22, alignment: 'leading' }),
            truncationMode('tail'),
          ]}>
          {title}
        </Text>
        <Spacer minLength={0} />
        <Text
          timerInterval={timerRange}
          countsDown={false}
          modifiers={[
            font({ size: 14, weight: 'heavy' }),
            monospacedDigit(),
            foregroundColor(accent),
            lineLimit(1),
            minimumScaleFactor(0.68),
            frame({ width: 66, height: 22, alignment: 'trailing' }),
          ]}
        />
        {stopButton(68, 26, 11)}
      </HStack>
    ),
  };
}

export const WorkoutLiveActivity = createLiveActivity<WorkoutLiveActivityProps>(
  'WorkoutLiveActivity',
  WorkoutLiveActivityView
);

export default WorkoutLiveActivity;
