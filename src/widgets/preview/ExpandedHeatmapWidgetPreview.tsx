import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import {
  buildHeatmapWidgetRows,
  parseHeatmapWidgetList,
} from '@/src/widgets/heatmap-widget-model';
import type { HeatmapWidgetProps } from '@/src/widgets/types';
import { WIDGET_PREVIEW_SPEC, WIDGET_RENDERER_CONTRACT } from '@/src/widgets/widget-spec';

const SPEC = WIDGET_RENDERER_CONTRACT.heatmap.previewVariants.fourWeekExpanded;
const WEEKEND_LABELS: readonly string[] =
  WIDGET_RENDERER_CONTRACT.heatmap.weekdayLabelColorPolicy.weekendLabels;

export function ExpandedHeatmapWidgetPreview({
  bodyPartLabels,
  style,
  widget,
}: {
  bodyPartLabels: string[];
  style?: StyleProp<ViewStyle>;
  widget: HeatmapWidgetProps;
}) {
  const rows = buildHeatmapWidgetRows(widget, 'month');
  const weekdayLabels = parseHeatmapWidgetList(widget.weekdayLabels).filter(Boolean);

  return (
    <View
      accessibilityLabel="지난 4주 운동 일자와 운동 부위 히트맵"
      accessible
      style={[
        styles.card,
        { backgroundColor: widget.background },
        style,
      ]}
    >
      <View style={styles.weekdayHeader}>
        {weekdayLabels.map((label) => (
          <View key={label} style={styles.weekdayCell}>
            <Text
              style={[
                styles.weekdayLabel,
                {
                  color: WEEKEND_LABELS.includes(label)
                    ? widget.weekendWeekdayLabelColor
                    : widget.weekdayLabelColor,
                },
              ]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((cell, cellIndex) => {
              const flatIndex = rowIndex * SPEC.columns + cellIndex;
              const bodyPartLabel = bodyPartLabels[flatIndex] ?? '';

              return (
                <View
                  key={`${rowIndex}-${cellIndex}`}
                  style={[
                    styles.cell,
                    {
                      backgroundColor: cell.color,
                    },
                  ]}
                >
                  {cell.label ? (
                    <Text style={[styles.dayLabel, { color: cell.labelColor }]}>
                      {cell.label}
                    </Text>
                  ) : null}
                  {bodyPartLabel ? (
                    <Text
                      ellipsizeMode="tail"
                      numberOfLines={SPEC.bodyPartMaxLines}
                      style={[styles.bodyPartLabel, { color: cell.labelColor }]}
                    >
                      {bodyPartLabel}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: SPEC.aspectRatio,
    borderColor: WIDGET_PREVIEW_SPEC.card.border,
    borderRadius: WIDGET_PREVIEW_SPEC.card.radius,
    borderWidth: StyleSheet.hairlineWidth,
    gap: SPEC.headerGap,
    padding: SPEC.contentPadding,
    width: '100%',
  },
  weekdayHeader: {
    flexDirection: 'row',
    height: SPEC.weekdayHeaderHeight,
  },
  weekdayCell: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  weekdayLabel: {
    fontSize: WIDGET_PREVIEW_SPEC.text.calendar.weekdaySize,
    fontWeight: WIDGET_PREVIEW_SPEC.text.calendar.weekdayWeight,
    lineHeight: WIDGET_PREVIEW_SPEC.text.calendar.weekdayLineHeight,
    textAlign: 'center',
  },
  grid: {
    flex: 1,
    gap: SPEC.cellGap,
    minHeight: 0,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: SPEC.cellGap,
    minHeight: 0,
  },
  cell: {
    alignItems: 'center',
    borderRadius: SPEC.cellRadius,
    flex: 1,
    gap: SPEC.cellContentGap,
    justifyContent: 'center',
    minWidth: 0,
  },
  dayLabel: {
    fontSize: SPEC.cellLabelSize,
    fontWeight: WIDGET_RENDERER_CONTRACT.designSystem.fontWeight.bold,
    lineHeight: SPEC.cellLabelLineHeight,
    textAlign: 'center',
  },
  bodyPartLabel: {
    alignSelf: 'stretch',
    fontSize: SPEC.bodyPartLabelSize,
    fontWeight: WIDGET_RENDERER_CONTRACT.designSystem.fontWeight.medium,
    lineHeight: SPEC.bodyPartLabelLineHeight,
    opacity: SPEC.bodyPartLabelOpacity,
    textAlign: 'center',
  },
});
