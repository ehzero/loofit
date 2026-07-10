import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { buildHeatmapWidgetRows } from '@/src/widgets/heatmap-widget-model';
import type { HeatmapWidgetProps } from '@/src/widgets/types';
import { WIDGET_PREVIEW_SPEC, type HeatmapWidgetVariant } from '@/src/widgets/widget-spec';

export function HeatmapWidgetPreview({
  title,
  variant,
  widget,
  style,
}: {
  title: string;
  variant: HeatmapWidgetVariant;
  widget: HeatmapWidgetProps;
  style?: StyleProp<ViewStyle>;
}) {
  const rows = buildHeatmapWidgetRows(widget, variant);
  const gridGap = widget.cellGap;

  return (
    <View style={[styles.card, { gap: widget.headerGap, padding: widget.contentPadding }, style]}>
      <View style={styles.header}>
        <Text
          style={[
            styles.title,
            {
              color: widget.titleColor,
              fontSize: widget.titleSize,
              lineHeight: WIDGET_PREVIEW_SPEC.text.label.lineHeight,
            },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.brand,
            {
              color: widget.brandColor,
              fontSize: widget.brandSize,
              lineHeight: WIDGET_PREVIEW_SPEC.text.brand.lineHeight,
            },
          ]}
        >
          LOOFIT
        </Text>
      </View>
      <View style={[styles.grid, { gap: gridGap }]}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={[styles.row, { gap: gridGap }]}>
            {row.map((color, cellIndex) => (
              <View
                key={`${rowIndex}-${cellIndex}`}
                style={[
                  styles.cell,
                  {
                    borderRadius: widget.cellRadius,
                    backgroundColor: color,
                  },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.grow} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: WIDGET_PREVIEW_SPEC.card.background,
    borderColor: WIDGET_PREVIEW_SPEC.card.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: WIDGET_PREVIEW_SPEC.card.radius,
    gap: WIDGET_PREVIEW_SPEC.card.gap,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontWeight: WIDGET_PREVIEW_SPEC.text.label.weight,
    letterSpacing: 0,
  },
  brand: {
    fontWeight: WIDGET_PREVIEW_SPEC.text.brand.weight,
    letterSpacing: 0,
  },
  grid: {
    marginTop: 0,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
  },
  grow: {
    flex: 1,
  },
});
