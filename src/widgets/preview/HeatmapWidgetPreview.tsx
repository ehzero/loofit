import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { buildHeatmapWidgetRows, parseHeatmapWidgetList } from '@/src/widgets/heatmap-widget-model';
import type { HeatmapWidgetProps } from '@/src/widgets/types';
import {
  WIDGET_PREVIEW_SPEC,
  WIDGET_RENDERER_CONTRACT,
  resolveHomeWidgetContentPadding,
  type HeatmapWidgetVariant,
} from '@/src/widgets/widget-spec';

const DESIGN_SYSTEM = WIDGET_RENDERER_CONTRACT.designSystem;
const TYPOGRAPHY = DESIGN_SYSTEM.typography;
const FONT_WEIGHT = DESIGN_SYSTEM.fontWeight;
const WEEK_FOOTER = WIDGET_RENDERER_CONTRACT.heatmap.weekFooter;

export function HeatmapWidgetPreview({
  title,
  variant,
  widget,
  footerSummary,
  footerRecords,
  footerStats,
  showHeader = false,
  style,
}: {
  title: string;
  variant: HeatmapWidgetVariant;
  widget: HeatmapWidgetProps;
  footerSummary?: string;
  footerRecords?: Array<{ when: string; title: string; value: string }>;
  footerStats?: Array<{ label: string; value: string }>;
  showHeader?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [cardSize, setCardSize] = useState({ height: 0, width: 0 });
  const rows = buildHeatmapWidgetRows(widget, variant);
  const rendererSpec = WIDGET_PREVIEW_SPEC.heatmap[variant];
  const gridGap = widget.cellGap;
  const weekdayLabels = (widget.weekdayLabels || '일,월,화,수,목,금,토').split(',').filter(Boolean);
  const weekendWeekdayLabels: readonly string[] =
    WIDGET_RENDERER_CONTRACT.heatmap.weekdayLabelColorPolicy.weekendLabels;
  const showCalendarLabels = variant !== 'year';
  const resolvedFooterStats = footerStats ?? parseFooterStats(widget);
  const resolvedFooterRecords = footerRecords ?? parseFooterRecords(widget);
  const monthSummary = variant === 'month' ? parseMonthSummary(widget) : '';
  const hasFooter =
    Boolean(footerSummary) ||
    Boolean(monthSummary) ||
    resolvedFooterStats.length > 0 ||
    Boolean(widget.recentWorkoutLabel) ||
    resolvedFooterRecords.length > 0;
  const fitsVariableMonthRows = variant === 'month' && showHeader && !hasFooter;
  const currentMonthSpec = WIDGET_RENDERER_CONTRACT.heatmap.previewVariants.currentMonth;
  const usesDenseMonthLayout =
    fitsVariableMonthRows && rows.length >= currentMonthSpec.denseRowThreshold;
  const resolvedHeaderGap = usesDenseMonthLayout
    ? currentMonthSpec.denseHeaderGap
    : widget.headerGap;
  const resolvedVerticalGap = usesDenseMonthLayout
    ? currentMonthSpec.denseVerticalGap
    : gridGap;
  const contentPadding = resolveHomeWidgetContentPadding(cardSize, widget.contentPadding);
  const fittedLayout = useMemo(() => {
    if (!fitsVariableMonthRows || cardSize.width <= 0 || cardSize.height <= 0) {
      return null;
    }
    const contentWidth = cardSize.width - contentPadding * 2;
    const contentHeight =
      cardSize.height -
      contentPadding * 2 -
      rendererSpec.headerLineHeight -
      resolvedHeaderGap;
    const widthCell = (contentWidth - gridGap * 6) / 7;
    if (usesDenseMonthLayout) {
      const weekdayHeight = currentMonthSpec.denseWeekdayHeaderHeight;
      const heightCell = Math.max(
        0,
        Math.min(
          widthCell,
          (contentHeight - weekdayHeight - resolvedVerticalGap * rows.length) /
            Math.max(rows.length, 1)
        )
      );
      return {
        calendarWidth: widthCell * 7 + gridGap * 6,
        cellHeight: heightCell,
        cellWidth: widthCell,
        weekdayHeight,
      };
    }
    const calendarRowCount = rows.length + 1;
    const cellSize = Math.max(
      0,
      Math.min(
        widthCell,
        (contentHeight - gridGap * rows.length) / Math.max(calendarRowCount, 1)
      )
    );
    return {
      calendarWidth: cellSize * 7 + gridGap * 6,
      cellHeight: cellSize,
      cellWidth: cellSize,
      weekdayHeight: cellSize,
    };
  }, [
    cardSize,
    contentPadding,
    currentMonthSpec.denseWeekdayHeaderHeight,
    fitsVariableMonthRows,
    gridGap,
    rendererSpec.headerLineHeight,
    resolvedHeaderGap,
    resolvedVerticalGap,
    rows.length,
    usesDenseMonthLayout,
  ]);
  const fittedCalendarWidth = fittedLayout?.calendarWidth;
  const fittedCellStyle =
    fittedLayout
      ? {
          aspectRatio: undefined,
          flex: 0,
          height: fittedLayout.cellHeight,
          width: fittedLayout.cellWidth,
        }
      : undefined;
  const fittedWeekdayStyle = fittedLayout
    ? {
        aspectRatio: undefined,
        flex: 0,
        height: fittedLayout.weekdayHeight,
        width: fittedLayout.cellWidth,
      }
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
        { backgroundColor: widget.background, gap: resolvedHeaderGap, padding: contentPadding },
        style,
      ]}>
      {rendererSpec.headerVisible || showHeader ? (
        <View style={styles.header}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={rendererSpec.headerMinimumScaleFactor}
            style={[
              styles.title,
              {
                color: widget.titleColor,
                fontSize: widget.titleSize,
                lineHeight: rendererSpec.headerLineHeight,
                opacity: fitsVariableMonthRows
                  ? currentMonthSpec.headerOpacity
                  : DESIGN_SYSTEM.opacity.muted,
              },
            ]}
          >
            {title}
          </Text>
        </View>
      ) : null}
      <View style={[styles.body, hasFooter ? styles.bodyWithFooter : styles.bodyCentered]}>
        {variant === 'year' ? (
          <YearHeatmapPreview rows={rows} widget={widget} />
        ) : (
          <View
            style={[
              styles.calendar,
              { gap: resolvedVerticalGap },
              fittedCalendarWidth ? { alignSelf: 'center', width: fittedCalendarWidth } : null,
            ]}
          >
            <View style={[styles.weekdayHeader, { gap: gridGap }]}>
              {weekdayLabels.map((label) => (
                <View
                  key={label}
                  style={[
                    styles.weekdayLabelCell,
                    {
                      aspectRatio:
                        1 / WIDGET_RENDERER_CONTRACT.heatmap.weekdayLabelHeightInCells,
                    },
                    fittedWeekdayStyle,
                  ]}
                >
                  <Text
                    style={[
                      styles.weekdayLabel,
                      {
                        color: weekendWeekdayLabels.includes(label)
                          ? widget.weekendWeekdayLabelColor
                          : widget.weekdayLabelColor,
                        fontSize: widget.weekdayLabelSize,
                        lineHeight: WIDGET_PREVIEW_SPEC.text.calendar.weekdayLineHeight,
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>

            <View style={[styles.grid, { gap: resolvedVerticalGap }]}>
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
                        cell.isToday
                          ? {
                              borderColor: widget.todayIndicatorColor,
                              borderWidth: widget.todayIndicatorWidth,
                            }
                          : null,
                        fittedCellStyle,
                      ]}>
                      {showCalendarLabels && cell.label ? (
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={rendererSpec.cellLabelMinimumScaleFactor}
                          style={[
                            styles.cellLabel,
                            {
                              color: cell.labelColor,
                              fontSize: widget.cellLabelSize,
                              lineHeight: TYPOGRAPHY.sm.lineHeight,
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
          <>
            {footerSummary ? (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={DESIGN_SYSTEM.minimumScale.default}
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
            {monthSummary ? (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={DESIGN_SYSTEM.minimumScale.dense}
                style={[
                  styles.monthSummary,
                  {
                    color: widget.titleColor,
                    fontSize: WIDGET_RENDERER_CONTRACT.heatmap.variants.year.headerFontSize,
                  },
                ]}
              >
                {monthSummary}
              </Text>
            ) : null}
            {resolvedFooterStats.length ? (
              <View style={styles.footerStatsTopRow}>
                {resolvedFooterStats.slice(0, 2).map((stat, index) => (
                  <HeatmapFooterStat
                    key={stat.label}
                    stat={stat}
                    widget={widget}
                    style={
                      index === 0 ? styles.footerStatCountItem : styles.footerStatDurationItem
                    }
                  />
                ))}
              </View>
            ) : null}
            {resolvedFooterStats[2] ? (
              <HeatmapFooterStat stat={resolvedFooterStats[2]} widget={widget} />
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
                        minimumFontScale={DESIGN_SYSTEM.minimumScale.default}
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
                      minimumFontScale={DESIGN_SYSTEM.minimumScale.default}
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
          </>
        ) : null}
      </View>
    </View>
  );
}

function HeatmapFooterStat({
  stat,
  widget,
  style,
}: {
  stat: { label: string; value: string };
  widget: HeatmapWidgetProps;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.footerStat, style]}>
      <Text style={[styles.footerStatLabel, { color: widget.brandColor }]}>{stat.label}</Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={WEEK_FOOTER.statValueMinimumScale}
        style={[styles.footerStatValue, { color: widget.footerValueColor }]}
      >
        {stat.value}
      </Text>
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

function parseMonthSummary(widget: HeatmapWidgetProps): string {
  const [count, duration] = parseHeatmapWidgetList(widget.footerStatValues);
  if (!count || !duration) {
    return '';
  }

  const footer = WIDGET_RENDERER_CONTRACT.heatmap.monthFooter;
  return `${count}${footer.separator}${footer.totalDurationPrefix}${duration}`;
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
  const weekCount = rows[0]?.length ?? 0;
  const normalGapWidth = widget.cellGap * Math.max(weekCount - 1, 0);
  const cellSize = Math.max(0, (width - normalGapWidth) / Math.max(weekCount, 1));

  const weekOffsets = useMemo(
    () => Array.from({ length: weekCount }, (_, week) => week * (cellSize + widget.cellGap)),
    [cellSize, weekCount, widget.cellGap]
  );

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
                        marginLeft: week === 0 ? 0 : widget.cellGap,
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
    fontWeight: FONT_WEIGHT.medium,
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
  weekdayLabelCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayLabel: {
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
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 0,
    textAlign: 'center',
  },
  yearCalendar: {
    width: '100%',
  },
  yearMonthHeader: {
    height: WIDGET_RENDERER_CONTRACT.heatmap.sixMonth.monthLabelHeight,
    marginBottom: WIDGET_PREVIEW_SPEC.heatmap.year.cellGap,
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
  footerSummary: {
    fontSize: TYPOGRAPHY.md.size,
    lineHeight: TYPOGRAPHY.md.lineHeight,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 0,
  },
  monthSummary: {
    fontWeight: FONT_WEIGHT.light,
    letterSpacing: 0,
    opacity: DESIGN_SYSTEM.opacity.muted,
  },
  footerRecords: {
    gap: WEEK_FOOTER.recentRowGap,
  },
  footerRecordsLabel: {
    fontSize: WEEK_FOOTER.recentLabelSize,
    lineHeight: TYPOGRAPHY.sm.lineHeight,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 0,
  },
  footerRecord: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: DESIGN_SYSTEM.spacing.md,
    width: '100%',
  },
  footerRecordValue: {
    flex: 1,
    fontSize: WEEK_FOOTER.recentValueSize,
    lineHeight: TYPOGRAPHY.md.lineHeight,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 0,
  },
  footerRecordMeta: {
    fontSize: WEEK_FOOTER.recentMetaSize,
    lineHeight: TYPOGRAPHY.sm.lineHeight,
    fontWeight: FONT_WEIGHT.medium,
    letterSpacing: 0,
  },
  footerStatsTopRow: {
    flexDirection: 'row',
    gap: WEEK_FOOTER.statGap,
  },
  footerStat: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: WEEK_FOOTER.statGap,
  },
  footerStatCountItem: {
    flex: 0.7,
  },
  footerStatDurationItem: {
    flex: 1.3,
  },
  footerStatLabel: {
    fontSize: WEEK_FOOTER.statLabelSize,
    lineHeight: TYPOGRAPHY.sm.lineHeight,
    fontWeight: FONT_WEIGHT.medium,
    letterSpacing: 0,
  },
  footerStatValue: {
    fontSize: WEEK_FOOTER.statValueSize,
    lineHeight: TYPOGRAPHY.lg.lineHeight,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: 0,
  },
});
