import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { buildHeatmapWidgetRows, parseHeatmapWidgetList } from '@/src/widgets/heatmap-widget-model';
import type { HeatmapWidgetProps } from '@/src/widgets/types';
import { WIDGET_PREVIEW_SPEC, type HeatmapWidgetVariant } from '@/src/widgets/widget-spec';

export function HeatmapWidgetPreview({
  title,
  variant,
  widget,
  footerSummary,
  footerRecords,
  footerStats,
  style,
}: {
  title: string;
  variant: HeatmapWidgetVariant;
  widget: HeatmapWidgetProps;
  footerSummary?: string;
  footerRecords?: Array<{ when: string; title: string; value: string }>;
  footerStats?: Array<{ label: string; value: string }>;
  style?: StyleProp<ViewStyle>;
}) {
  const rows = buildHeatmapWidgetRows(widget, variant);
  const gridGap = widget.cellGap;
  const weekdayLabels = (widget.weekdayLabels || '일,월,화,수,목,금,토').split(',').filter(Boolean);
  const showCalendarLabels = variant !== 'year';
  const resolvedFooterStats = footerStats ?? parseFooterStats(widget);
  const resolvedFooterRecords = footerRecords ?? parseFooterRecords(widget);
  const hasFooter =
    Boolean(footerSummary) ||
    resolvedFooterStats.length > 0 ||
    Boolean(widget.recentWorkoutLabel) ||
    resolvedFooterRecords.length > 0;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: widget.background, gap: widget.headerGap, padding: widget.contentPadding },
        style,
      ]}>
      <View style={styles.header}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[
            styles.title,
            {
              color: widget.titleColor,
              fontSize: Math.max(widget.titleSize - 1, 9),
              lineHeight: Math.max(WIDGET_PREVIEW_SPEC.text.label.lineHeight - 1, 12),
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
          {widget.brandName}
        </Text>
      </View>
      <View style={[styles.body, hasFooter ? styles.bodyWithFooter : styles.bodyCentered]}>
        {variant === 'year' ? (
          <YearHeatmapPreview rows={rows} widget={widget} />
        ) : (
          <View style={[styles.calendar, { gap: gridGap }]}>
            <View style={[styles.weekdayHeader, { gap: gridGap }]}>
              {weekdayLabels.map((label) => (
                <Text
                  key={label}
                  style={[
                    styles.weekdayLabel,
                    {
                      color: widget.weekdayLabelColor,
                      fontSize: widget.weekdayLabelSize,
                      lineHeight: WIDGET_PREVIEW_SPEC.text.calendar.weekdayLineHeight,
                    },
                  ]}
                >
                  {label}
                </Text>
              ))}
            </View>

            <View style={[styles.grid, { gap: gridGap }]}>
              {rows.map((row, rowIndex) => (
                <View key={rowIndex} style={[styles.row, { gap: gridGap }]}>
                  {row.map((cell, cellIndex) => (
                    <View
                      key={`${rowIndex}-${cellIndex}`}
                      style={[
                        styles.cell,
                        {
                          borderRadius: widget.cellRadius,
                          backgroundColor: cell.color,
                        },
                      ]}>
                      {showCalendarLabels && cell.label ? (
                        <Text
                          style={[
                            styles.cellLabel,
                            {
                              color: cell.labelColor,
                              fontSize: widget.cellLabelSize,
                              lineHeight: widget.cellLabelSize + 2,
                            },
                          ]}
                        >
                          {cell.label}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}

        {hasFooter ? (
          <View style={styles.footerGroup}>
            {footerSummary ? (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                style={[
                  styles.footerSummary,
                  {
                    color: widget.footerValueColor,
                  },
                ]}
              >
                {footerSummary}
              </Text>
            ) : null}
            {resolvedFooterStats.length ? (
              <View style={styles.footerStats}>
                {resolvedFooterStats.map((stat) => (
                  <View key={stat.label} style={styles.footerStat}>
                    <Text
                      style={[
                        styles.footerStatLabel,
                        {
                          color: widget.brandColor,
                        },
                      ]}
                    >
                      {stat.label}
                    </Text>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      style={[
                        styles.footerStatValue,
                        {
                          color: widget.footerValueColor,
                        },
                      ]}
                    >
                      {stat.value}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {widget.recentWorkoutLabel || resolvedFooterRecords.length ? (
              <View style={styles.footerRecords}>
                <Text
                  style={[
                    styles.footerRecordsLabel,
                    {
                      color: widget.brandColor,
                    },
                  ]}
                >
                  {widget.recentWorkoutLabel || '최근 운동'}
                </Text>
                {resolvedFooterRecords.length ? (
                  resolvedFooterRecords.map((record, index) => (
                    <View key={`${record.when}-${record.title}-${index}`} style={styles.footerRecord}>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                        style={[
                          styles.footerRecordValue,
                          {
                            color: widget.footerValueColor,
                          },
                        ]}
                      >
                        {[record.title, record.value].filter(Boolean).join(' · ')}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.footerRecordMeta,
                          {
                            color: widget.brandColor,
                          },
                        ]}
                      >
                        {record.when}
                      </Text>
                    </View>
                  ))
                ) : (
                  <View style={styles.footerRecord}>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                      style={[
                        styles.footerRecordValue,
                        {
                          color: widget.footerValueColor,
                        },
                      ]}
                    >
                      아직 기록 없음
                    </Text>
                  </View>
                )}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function parseFooterStats(widget: HeatmapWidgetProps): Array<{ label: string; value: string }> {
  const labels = parseHeatmapWidgetList(widget.footerStatLabels);
  const values = parseHeatmapWidgetList(widget.footerStatValues);
  return labels
    .map((label, index) => ({ label, value: values[index] ?? '' }))
    .filter((stat) => stat.label && stat.value);
}

function parseFooterRecords(widget: HeatmapWidgetProps): Array<{ when: string; title: string; value: string }> {
  const titles = parseHeatmapWidgetList(widget.recentWorkoutTitles);
  const metas = parseHeatmapWidgetList(widget.recentWorkoutMetas);
  return titles
    .map((title, index) => ({ title, value: '', when: metas[index] ?? '' }))
    .filter((record) => record.title && record.when);
}

function YearHeatmapPreview({
  rows,
  widget,
}: {
  rows: ReturnType<typeof buildHeatmapWidgetRows>;
  widget: HeatmapWidgetProps;
}) {
  const [width, setWidth] = useState(0);
  const monthLabels = useMemo(() => parseHeatmapWidgetList(widget.monthLabels), [widget.monthLabels]);
  const monthGapBeforeWeeks = useMemo(
    () => parseHeatmapWidgetList(widget.monthGapBeforeWeeks),
    [widget.monthGapBeforeWeeks]
  );
  const weekCount = rows[0]?.length ?? 0;
  const monthGapColumns = widget.monthGapColumns ?? 0;
  const boundaryCount = monthGapBeforeWeeks.filter((flag, index) => flag === '1' && index > 0).length;
  const normalGapWidth = widget.cellGap * Math.max(weekCount - 1, 0);
  const availableUnits = Math.max(weekCount + boundaryCount * monthGapColumns, 1);
  const cellSize = Math.max(0, (width - normalGapWidth) / availableUnits);
  const monthGap = cellSize * monthGapColumns;

  const weekOffsets = useMemo(() => {
    let offset = 0;
    return Array.from({ length: weekCount }, (_, week) => {
      if (week > 0) {
        offset += widget.cellGap;
        if (monthGapBeforeWeeks[week] === '1') {
          offset += monthGap;
        }
      }
      const current = offset;
      offset += cellSize;
      return current;
    });
  }, [cellSize, monthGap, monthGapBeforeWeeks, weekCount, widget.cellGap]);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.yearCalendar} onLayout={onLayout}>
      {width > 0 ? (
        <>
          <View style={styles.yearMonthHeader}>
            {monthLabels.map((label, week) =>
              label ? (
                <Text
                  key={`${label}-${week}`}
                  style={[
                    styles.yearMonthLabel,
                    {
                      color: widget.weekdayLabelColor,
                      fontSize: widget.monthLabelSize,
                      left: weekOffsets[week],
                      lineHeight: WIDGET_PREVIEW_SPEC.text.calendar.monthLineHeight,
                    },
                  ]}
                >
                  {label}
                </Text>
              ) : null
            )}
          </View>

          <View style={styles.yearRows}>
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.yearRow}>
                {row.map((cell, week) => (
                  <View
                    key={`${rowIndex}-${week}`}
                    style={[
                      styles.yearCell,
                      {
                        backgroundColor: cell.color,
                        borderRadius: widget.cellRadius,
                        height: cellSize,
                        marginLeft:
                          week === 0
                            ? 0
                            : widget.cellGap + (monthGapBeforeWeeks[week] === '1' ? monthGap : 0),
                        width: cellSize,
                      },
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        </>
      ) : null}
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
    flex: 1,
    marginRight: 8,
    fontWeight: '700',
    letterSpacing: 0,
    opacity: 0.72,
  },
  brand: {
    fontWeight: WIDGET_PREVIEW_SPEC.text.brand.weight,
    letterSpacing: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  bodyCentered: {
    justifyContent: 'center',
  },
  bodyWithFooter: {
    justifyContent: 'space-between',
  },
  calendar: {
    width: '100%',
  },
  weekdayHeader: {
    flexDirection: 'row',
    width: '100%',
  },
  weekdayLabel: {
    flex: 1,
    fontWeight: WIDGET_PREVIEW_SPEC.text.calendar.weekdayWeight,
    letterSpacing: 0,
    textAlign: 'center',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLabel: {
    fontWeight: '800',
    letterSpacing: 0,
    textAlign: 'center',
  },
  yearCalendar: {
    width: '100%',
  },
  yearMonthHeader: {
    height: WIDGET_PREVIEW_SPEC.text.calendar.monthLineHeight,
    marginBottom: 4,
    position: 'relative',
  },
  yearMonthLabel: {
    fontWeight: WIDGET_PREVIEW_SPEC.text.calendar.weekdayWeight,
    letterSpacing: 0,
    position: 'absolute',
    top: 0,
  },
  yearRows: {
    gap: WIDGET_PREVIEW_SPEC.heatmap.year.cellGap,
  },
  yearRow: {
    flexDirection: 'row',
  },
  yearCell: {
    aspectRatio: 1,
  },
  footerGroup: {
    gap: 4,
  },
  footerSummary: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  footerRecords: {
    gap: 2,
  },
  footerRecordsLabel: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
  footerRecord: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    width: '100%',
  },
  footerRecordValue: {
    flex: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  footerRecordMeta: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  footerStats: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  footerStat: {
    flex: 1,
    gap: 1,
  },
  footerStatLabel: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
  footerStatValue: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
});
