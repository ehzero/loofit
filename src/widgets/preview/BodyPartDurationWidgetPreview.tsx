import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { formatDuration } from '@/src/domain/date';
import { WIDGET_PREVIEW_SPEC, WIDGET_RENDERER_CONTRACT } from '@/src/widgets/widget-spec';

const SPEC = WIDGET_PREVIEW_SPEC.bodyPartDuration;

export type BodyPartDurationPreviewPalette = {
  accent: string;
  background: string;
  border: string;
  raisedSurface: string;
  textHigh: string;
  textMedium: string;
};

export type BodyPartDurationPreviewItem = {
  bodyPart: string;
  durationSeconds: number;
};

export function BodyPartDurationWidgetPreview({
  items,
  palette,
  style,
}: {
  items: BodyPartDurationPreviewItem[];
  palette: BodyPartDurationPreviewPalette;
  style?: StyleProp<ViewStyle>;
}) {
  const visibleItems = [...items]
    .sort((left, right) => right.durationSeconds - left.durationSeconds)
    .slice(0, SPEC.visibleItemLimit);
  const maxDuration = Math.max(...visibleItems.map((item) => item.durationSeconds), 1);

  return (
    <View
      accessible
      accessibilityLabel={`최근 ${SPEC.rangeDays}일 부위별 운동 시간`}
      style={[
        styles.card,
        { backgroundColor: palette.background, borderColor: palette.border },
        style,
      ]}
    >
      <Text
        ellipsizeMode="tail"
        numberOfLines={1}
        style={[styles.title, { color: palette.textHigh }]}
      >
        최근 {SPEC.rangeDays}일
      </Text>

      <View style={styles.list}>
        {visibleItems.map((item) => (
          <View key={item.bodyPart} style={styles.item}>
            <View style={styles.itemHeader}>
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={[styles.bodyPart, { color: palette.textHigh }]}
              >
                {item.bodyPart}
              </Text>
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={[styles.duration, { color: palette.textMedium }]}
              >
                {formatDuration(item.durationSeconds)}
              </Text>
            </View>
            <View
              style={[
                styles.bar,
                {
                  backgroundColor: palette.raisedSurface,
                  borderRadius: SPEC.bar.radius,
                  height: SPEC.bar.height,
                },
              ]}
            >
              <View style={{ backgroundColor: palette.accent, flex: item.durationSeconds }} />
              <View style={{ flex: Math.max(maxDuration - item.durationSeconds, 0) }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    overflow: 'hidden',
    width: '100%',
  },
  bodyPart: {
    flex: 1,
    fontSize: SPEC.text.bodyPart.size,
    fontWeight: SPEC.text.bodyPart.weight,
    lineHeight: SPEC.text.bodyPart.lineHeight,
    minWidth: 0,
  },
  card: {
    aspectRatio: 1,
    borderRadius: WIDGET_PREVIEW_SPEC.card.radius,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent:
      SPEC.verticalDistribution === 'spaceBetween' ? 'space-between' : 'flex-start',
    padding: SPEC.contentPadding,
    width: '100%',
  },
  duration: {
    flexShrink: 0,
    fontSize: SPEC.text.duration.size,
    fontWeight: SPEC.text.duration.weight,
    lineHeight: SPEC.text.duration.lineHeight,
  },
  item: {
    gap: WIDGET_RENDERER_CONTRACT.designSystem.spacing.xs,
  },
  itemHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: WIDGET_RENDERER_CONTRACT.designSystem.spacing.sm,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  list: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: WIDGET_RENDERER_CONTRACT.designSystem.spacing.md,
  },
  title: {
    fontSize: SPEC.text.title.size,
    fontWeight: SPEC.text.title.weight,
    lineHeight: SPEC.text.title.lineHeight,
  },
});
