import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { WIDGET_PREVIEW_SPEC, WIDGET_RENDERER_CONTRACT } from '@/src/widgets/widget-spec';

const SPEC = WIDGET_PREVIEW_SPEC.routineProgress.textList;

export type RoutineProgressTextListItem = {
  bodyParts: string;
  duration: string;
  relativeDay: string;
  split: string;
  workoutAlias?: string;
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
  const resolvedCurrentIndex = items.length
    ? Math.min(Math.max(currentIndex, 0), items.length - 1)
    : 0;
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.background, borderColor: palette.border },
        style,
      ]}
    >
      {items.map((item, index) => {
        const current = index === resolvedCurrentIndex;
        const rowColor = current
          ? palette[SPEC.currentTextColorRole]
          : palette[SPEC.nonCurrentTextColorRole];
        const metadata = [item.bodyParts, item.duration]
          .filter(Boolean)
          .join(SPEC.metadataSeparator);

        return (
          <View
            accessibilityLabel={`${current ? '현재 순서, ' : ''}${item.split}, ${item.relativeDay}, ${metadata}`}
            accessible
            key={`${item.split}-${index}`}
            style={styles.item}
          >
            <View style={styles.row}>
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={[styles.split, { color: rowColor }]}
              >
                {item.split}
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
    justifyContent:
      SPEC.verticalDistribution === 'spaceBetween' ? 'space-between' : 'flex-start',
    padding: SPEC.contentPadding,
    width: '100%',
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
