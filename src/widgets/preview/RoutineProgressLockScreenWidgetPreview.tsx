import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { RoutineProgressTextListItem } from '@/src/widgets/preview/RoutineProgressTextListWidgetPreview';
import { WIDGET_PREVIEW_SPEC } from '@/src/widgets/widget-spec';

const SPEC = WIDGET_PREVIEW_SPEC.routineProgress.textList.lockScreen;

export type RoutineProgressLockScreenPalette = {
  background: string;
  border: string;
  textHigh: string;
  textLow: string;
};

export function RoutineProgressLockScreenWidgetPreview({
  currentIndex,
  items,
  palette,
  style,
}: {
  currentIndex: number;
  items: RoutineProgressTextListItem[];
  palette: RoutineProgressLockScreenPalette;
  style?: StyleProp<ViewStyle>;
}) {
  const resolvedCurrentIndex = items.length
    ? Math.min(Math.max(currentIndex, 0), items.length - 1)
    : 0;
  const maxStartIndex = Math.max(0, items.length - SPEC.visibleItemLimit);
  const startIndex = Math.min(
    Math.max(resolvedCurrentIndex - Math.floor(SPEC.visibleItemLimit / 2), 0),
    maxStartIndex
  );
  const visibleItems = items.slice(startIndex, startIndex + SPEC.visibleItemLimit);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: palette.background, borderColor: palette.border },
        style,
      ]}
    >
      {visibleItems.map((item, visibleIndex) => {
        const current = startIndex + visibleIndex === resolvedCurrentIndex;
        const workoutLabel = item.workoutAlias?.trim() || item.bodyParts;
        const textColor = current
          ? palette[SPEC.currentTextColorRole]
          : palette[SPEC.nonCurrentTextColorRole];

        return (
          <View
            accessibilityLabel={`${current ? '현재 순서, ' : ''}${workoutLabel}, ${item.relativeDay}`}
            accessible
            key={`${item.split}-${startIndex + visibleIndex}`}
            style={styles.item}
          >
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={[styles.workout, { color: textColor }]}
            >
              {workoutLabel}
            </Text>
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={[styles.relativeDay, { color: textColor }]}
            >
              {item.relativeDay}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: SPEC.orientation === 'horizontal' ? 'row' : 'column',
    gap: SPEC.columnGap,
    padding: SPEC.contentPadding,
  },
  item: {
    alignItems: SPEC.horizontalAlignment,
    flex: 1,
    gap: SPEC.itemGap,
    justifyContent: 'center',
    minWidth: 0,
  },
  relativeDay: {
    alignSelf: 'stretch',
    fontSize: SPEC.text.relativeDay.size,
    fontWeight: SPEC.text.relativeDay.weight,
    lineHeight: SPEC.text.relativeDay.lineHeight,
    textAlign: SPEC.horizontalAlignment,
  },
  workout: {
    alignSelf: 'stretch',
    fontSize: SPEC.text.workout.size,
    fontWeight: SPEC.text.workout.weight,
    lineHeight: SPEC.text.workout.lineHeight,
    textAlign: SPEC.horizontalAlignment,
  },
});
