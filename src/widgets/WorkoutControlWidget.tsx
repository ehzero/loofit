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
  const DEFAULT_BG = '#141418';
  const DEFAULT_TX = '#F4F4F2';
  const DEFAULT_TX3 = '#8A8A90';
  const DEFAULT_TX4 = '#6B6B70';
  const DEFAULT_DARK_BUTTON = '#26262B';
  const CARD_PADDING = 16;
  const HEADER_HEIGHT = 14;
  const BODY_HEIGHT = 54;
  const BODY_GAP = 4;
  const ACTIVE_DOT_SIZE = 7;
  const ACTIVE_DOT_GAP = 6;
  const CTA_HEIGHT = 28;
  const CTA_RADIUS = 12;
  const FOOTER_WITH_RANGE_HEIGHT = 41;
  const FOOTER_GAP = 1;
  const TIMER_MAX_HOURS = 8;

  const accent = props.accent ?? '#CFF56A';
  const accentText = props.accentText ?? '#0B0B0B';
  const bg = props.background || DEFAULT_BG;
  const titleColor = props.titleColor || DEFAULT_TX;
  const detailColor = props.detailColor || DEFAULT_TX3;
  const labelColor = props.labelColor || DEFAULT_TX3;
  const brandColor = props.brandColor || DEFAULT_TX4;
  const secondaryButtonBackground = props.secondaryButtonBackground || DEFAULT_DARK_BUTTON;
  const secondaryButtonText = props.secondaryButtonText || titleColor;
  const brandName = props.brandName || '';
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
  const rawDetail = (props.detail ?? '').split(' + ').join(' · ');
  const fallbackDetail = !isActive && !isCompleted && title && subtitle ? subtitle : '';
  const detail = rawDetail || fallbackDetail;
  // Native idle props use the raw day name, which is empty for alias-less
  // splits — fall back to the part list.
  const heading = title || detail || subtitle;
  const visibleDetail = detail && detail !== heading ? detail : '';

  // Preview-style full-width pill CTA. In WidgetKit extraction, a plain
  // Button can keep its background at the label's intrinsic width, so the
  // visual pill is rendered by a full-width HStack inside the button.
  const cta = (label: string, target: string, bg: string, fg: string) => (
    <Button
      key="cta"
      target={target}
      modifiers={[
        buttonStyle('plain'),
        frame({ height: CTA_HEIGHT, maxWidth: 10000 }),
      ]}>
      <HStack
        spacing={0}
        modifiers={[
          frame({ height: CTA_HEIGHT, maxWidth: 10000 }),
          background(bg),
          cornerRadius(CTA_RADIUS),
        ]}>
        {[
          <Spacer key="leading" minLength={0} />,
          <Text key="label" modifiers={[font({ size: 13, weight: 'heavy' }), foregroundColor(fg)]}>
            {label}
          </Text>,
          <Spacer key="trailing" minLength={0} />,
        ]}
      </HStack>
    </Button>
  );

  const headerLeft = isActive ? (
    <HStack key="left" spacing={ACTIVE_DOT_GAP}>
      {[
        <Circle
          key="dot"
          modifiers={[
            frame({ width: ACTIVE_DOT_SIZE, height: ACTIVE_DOT_SIZE }),
            foregroundColor(accent),
          ]}
        />,
        <Text key="label" modifiers={[font({ size: 11, weight: 'heavy' }), foregroundColor(accent)]}>
          운동 중
        </Text>,
      ]}
    </HStack>
  ) : (
    <Text key="left" modifiers={[font({ size: 11, weight: 'heavy' }), foregroundColor(labelColor)]}>
      {isCompleted ? '오늘 운동 완료' : '다음 운동'}
    </Text>
  );

  const header = (
    <HStack key="header" spacing={4} modifiers={[frame({ height: HEADER_HEIGHT, maxWidth: 10000 })]}>
      {[
        headerLeft,
        <Spacer key="spacer" />,
        <Text key="brand" modifiers={[font({ size: 10, weight: 'bold' }), foregroundColor(brandColor)]}>
          {brandName}
        </Text>,
      ]}
    </HStack>
  );

  const children = [header];
  const titleBlock = (key: string) => (
    <VStack
      key={key}
      alignment="leading"
      spacing={BODY_GAP}
      modifiers={[frame({ height: BODY_HEIGHT, maxWidth: 10000, alignment: 'leading' })]}>
      {visibleDetail
        ? [
            <Text key="name" modifiers={[font({ size: 19, weight: 'heavy' }), foregroundColor(titleColor)]}>
              {heading}
            </Text>,
            <Text
              key="detail"
              modifiers={[font({ size: 13, weight: 'semibold' }), foregroundColor(detailColor)]}>
              {visibleDetail}
            </Text>,
          ]
        : [
            <Text key="name" modifiers={[font({ size: 19, weight: 'heavy' }), foregroundColor(titleColor)]}>
              {heading}
            </Text>,
          ]}
    </VStack>
  );

  if (isActive) {
    // Timer + parts are one tight block (spacing 4), matching the preview.
    children.push(
      <Spacer key="topSpacer" minLength={0} />,
      <VStack
        key="timerBlock"
        alignment="leading"
        spacing={BODY_GAP}
        modifiers={[frame({ height: BODY_HEIGHT, maxWidth: 10000, alignment: 'leading' })]}>
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
              foregroundColor(titleColor),
            ]}
          />,
          <Text
            key="parts"
            modifiers={[font({ size: 13, weight: 'semibold' }), foregroundColor(detailColor)]}>
            {heading}
          </Text>,
        ]}
      </VStack>,
      <Spacer key="bottomSpacer" minLength={0} />,
      cta('운동 종료', 'end-active', secondaryButtonBackground, secondaryButtonText)
    );
  } else if (isCompleted) {
    const completedFooterHeight = subtitle ? FOOTER_WITH_RANGE_HEIGHT : CTA_HEIGHT;
    const completedBottomChildren = subtitle
      ? [
          <Text
            key="duration"
            modifiers={[font({ size: 22, weight: 'heavy' }), foregroundColor(accent)]}>
            {props.durationLabel}
          </Text>,
          <Text
            key="range"
            modifiers={[font({ size: 11, weight: 'semibold' }), foregroundColor(detailColor)]}>
            {subtitle}
          </Text>,
        ]
      : [
          <Text
            key="duration"
            modifiers={[font({ size: 22, weight: 'heavy' }), foregroundColor(accent)]}>
            {props.durationLabel}
          </Text>,
        ];

    children.push(
      <Spacer key="topSpacer" minLength={0} />,
      titleBlock('titleBlock'),
      <Spacer key="bottomSpacer" minLength={0} />,
      <VStack
        key="completedBottom"
        alignment="leading"
        spacing={FOOTER_GAP}
        modifiers={[
          frame({ height: completedFooterHeight, maxWidth: 10000, alignment: 'topLeading' }),
        ]}>
        {completedBottomChildren}
      </VStack>
    );
  } else {
    children.push(
      <Spacer key="topSpacer" minLength={0} />,
      titleBlock('titleBlock'),
      <Spacer key="bottomSpacer" minLength={0} />,
      cta('운동 시작', 'start-recommended', accent, accentText)
    );
  }

  return (
    <VStack
      alignment="leading"
      spacing={0}
      modifiers={[padding({ all: CARD_PADDING }), containerBackground(bg, 'widget')]}>
      {children}
    </VStack>
  );
}

export const WorkoutControlWidget = createWidget<WorkoutControlWidgetProps>(
  'WorkoutControlWidget',
  WorkoutControlWidgetView
);

export default WorkoutControlWidget;
