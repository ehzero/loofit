import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  WIDGET_PREVIEW_SPEC,
  WIDGET_RENDERER_CONTRACT,
  resolveHomeWidgetContentPadding,
} from '@/src/widgets/widget-spec';
import { resolveRoutineProgressLabels } from '@/src/widgets/routine-progress-widget-model';

const SPEC = WIDGET_PREVIEW_SPEC.routineProgress.textList;

export type RoutineProgressTextListItem = {
  bodyParts: string;
  duration: string;
  relativeDay: string;
  split: string;
};

export type RoutineProgressTextListPalette = {
  accent: string;
  background: string;
  border: string;
  textLow: string;
};

export function RoutineProgressTextListWidgetPreview({
  currentIndex,
  items,
  palette,
  style,
}: {
  currentIndex: number;
  items: RoutineProgressTextListItem[];
  palette: RoutineProgressTextListPalette;
  style?: StyleProp<ViewStyle>;
}) {
  const [cardSize, setCardSize] = useState({ height: 0, width: 0 });
  const resolvedCurrentIndex = items.length
    ? Math.min(Math.max(currentIndex, 0), items.length - 1)
    : 0;
  const maxStartIndex = Math.max(0, items.length - SPEC.visibleItemLimit);
  const startIndex = Math.min(
    Math.max(resolvedCurrentIndex - Math.floor(SPEC.visibleItemLimit / 2), 0),
    maxStartIndex
  );
  const visibleItems = items.slice(startIndex, startIndex + SPEC.visibleItemLimit);
  const visibleCurrentIndex = resolvedCurrentIndex - startIndex;
  const compact = visibleItems.length >= SPEC.visibleItemLimit;
  const horizontalPadding = resolveHomeWidgetContentPadding(cardSize, SPEC.contentPadding);
  const verticalPadding = resolveHomeWidgetContentPadding(
    cardSize,
    compact
      ? SPEC.layoutByVisibleItemCount['4'].verticalContentPadding
      : SPEC.contentPadding
  );
  const distributionStyle =
    visibleItems.length <= 2
      ? styles.centeredGroup
      : styles.spaceBetween;
  const itemGap =
    visibleItems.length === 2
      ? SPEC.layoutByVisibleItemCount['2'].itemGap
      : undefined;
  return (
    <View
      onLayout={(event) => {
        const { height, width } = event.nativeEvent.layout;
        setCardSize((current) =>
          current.height === height && current.width === width ? current : { height, width }
        );
      }}
      style={[
        styles.card,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          gap: itemGap,
          paddingHorizontal: horizontalPadding,
          paddingVertical: verticalPadding,
        },
        distributionStyle,
        style,
      ]}
    >
      {visibleItems.map((item, index) => {
        const labels = resolveRoutineProgressLabels(item);
        const current = index === visibleCurrentIndex;
        const rowColor = current
          ? palette[SPEC.currentTextColorRole]
          : palette[SPEC.nonCurrentTextColorRole];
        const metadata = [labels.bodyPartDetail, item.duration]
          .filter(Boolean)
          .join(SPEC.metadataSeparator);

        return (
          <View
            accessibilityLabel={`${current ? '현재 순서, ' : ''}${labels.workoutLabel}, ${item.relativeDay}, ${metadata}`}
            accessible
            key={`${labels.workoutLabel}-${index}`}
            style={styles.item}
          >
            <View style={styles.row}>
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={[
                  styles.split,
                  compact && styles.compactSplit,
                  { color: rowColor },
                ]}
              >
                {labels.workoutLabel}
              </Text>
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={[styles.relativeDay, { color: rowColor }]}
              >
                {item.relativeDay}
              </Text>
            </View>
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={[styles.metadata, { color: rowColor }]}
            >
              {metadata}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 1,
    borderRadius: WIDGET_PREVIEW_SPEC.card.radius,
    borderWidth: StyleSheet.hairlineWidth,
    width: '100%',
  },
  centeredGroup: {
    justifyContent: 'center',
  },
  spaceBetween: {
    justifyContent: 'space-between',
  },
  row: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: WIDGET_RENDERER_CONTRACT.designSystem.spacing.sm,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  item: {
    alignSelf: 'stretch',
    gap: WIDGET_RENDERER_CONTRACT.designSystem.spacing.xs,
    minWidth: 0,
  },
  split: {
    flexShrink: 1,
    fontSize: SPEC.text.split.size,
    fontWeight: SPEC.text.split.weight,
    lineHeight: SPEC.text.split.lineHeight,
    minWidth: 0,
  },
  compactSplit: {
    fontSize: SPEC.compactText.split.size,
    fontWeight: SPEC.compactText.split.weight,
    lineHeight: SPEC.compactText.split.lineHeight,
  },
  relativeDay: {
    flexShrink: 0,
    fontSize: SPEC.text.metadata.size,
    fontWeight: SPEC.text.metadata.weight,
    lineHeight: SPEC.text.metadata.lineHeight,
  },
  metadata: {
    alignSelf: 'stretch',
    fontSize: SPEC.text.metadata.size,
    fontWeight: SPEC.text.metadata.weight,
    lineHeight: SPEC.text.metadata.lineHeight,
    minWidth: 0,
    textAlign: 'left',
  },
});
