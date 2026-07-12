import { useMemo, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { weekdayLabel } from "@/src/domain/date";
import { buildWeekdayAlignedRows } from "@/src/domain/heatmap-layout";
import { useTheme } from "@/src/theme/ThemeProvider";
import { heatColor, typeScale, type ThemeColors } from "@/src/theme/tokens";
import type { HeatmapDay } from "@/src/types";

type HeatCell = HeatmapDay & {
  /** false renders the out-of-range placeholder (grid-alignment filler). */
  inRange?: boolean;
  /** transparent spacer inserted before a month transition in the year grid. */
  isGap?: boolean;
};

const CALENDAR_COLUMNS = 7;
const SUNDAY_FIRST_WEEKDAY_LABELS = [
  "일",
  "월",
  "화",
  "수",
  "목",
  "금",
  "토",
];

/**
 * The single heatmap style: a weekday-aligned calendar grid with labels on
 * top. 7 cells render as one row (labels show those days' actual weekdays);
 * longer ranges are explicitly split into weeks, Sunday-first.
 */
export function HeatGrid({
  cells,
  colorsOverride,
  gap = 5,
  radius = 5,
  weekdayLabels = false,
  alignToWeekdays = false,
}: {
  cells: HeatCell[];
  colorsOverride?: ThemeColors;
  gap?: number;
  radius?: number;
  weekdayLabels?: boolean;
  alignToWeekdays?: boolean;
}) {
  const { colors: themeColors } = useTheme();
  const colors = colorsOverride ?? themeColors;
  const rows = useMemo(
    () =>
      alignToWeekdays
        ? buildWeekdayAlignedRows(cells)
        : buildCalendarRows(cells),
    [alignToWeekdays, cells],
  );
  const firstRow = rows[0] ?? [];
  const headerLabels = alignToWeekdays
    ? SUNDAY_FIRST_WEEKDAY_LABELS
    : firstRow.map((cell) => (cell ? weekdayLabel(cell.dateKey) : ""));

  return (
    <View style={{ gap: 7 }}>
      {weekdayLabels ? (
        // Calendar-aligned ranges keep a fixed Sunday-first header.
        <View style={[styles.weekdayHeader, { gap }]}>
          {headerLabels.map((label, index) => (
            <View key={`${label}-${index}`} style={styles.weekdayHeaderCell}>
              <Text
                style={[styles.weekdayHeaderLabel, { color: colors.tx5 }]}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={[styles.grid, { gap }]}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={[styles.calendarRow, { gap }]}>
            {row.map((cell, columnIndex) => (
              <View
                key={
                  cell
                    ? `${cell.dateKey}-${rowIndex}-${columnIndex}`
                    : `placeholder-${rowIndex}-${columnIndex}`
                }
                style={[
                  styles.calendarCell,
                  {
                    borderRadius: radius,
                    backgroundColor: cell
                      ? heatColor(colors, cell.bucket, cell.inRange ?? true)
                      : "transparent",
                  },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function buildCalendarRows(cells: HeatCell[]): Array<Array<HeatCell | null>> {
  const rows: Array<Array<HeatCell | null>> = [];

  for (let index = 0; index < cells.length; index += CALENDAR_COLUMNS) {
    const row: Array<HeatCell | null> = cells.slice(
      index,
      index + CALENDAR_COLUMNS,
    );
    while (row.length < CALENDAR_COLUMNS) {
      row.push(null);
    }
    rows.push(row);
  }

  return rows;
}

const YEAR_CELL = 12;
const YEAR_GAP = 3;
const YEAR_COLUMN_WIDTH = YEAR_CELL + YEAR_GAP;

function yearMonthMarkers(cells: HeatCell[]) {
  const weekCount = Math.ceil(cells.length / 7);
  const markers: Array<{ key: string; label: string; week: number }> = [];
  let previousMonth: number | null = null;

  for (let week = 0; week < weekCount; week += 1) {
    const weekCells = cells.slice(week * 7, week * 7 + 7);
    const firstVisibleCell = weekCells.find(
      (cell) => !cell.isGap && cell.dateKey && (cell.inRange ?? true),
    );
    if (!firstVisibleCell) {
      continue;
    }

    const [, monthValue] = firstVisibleCell.dateKey.split("-").map(Number);
    if (!monthValue || monthValue === previousMonth) {
      continue;
    }

    previousMonth = monthValue;
    markers.push({
      key: `${firstVisibleCell.dateKey}-${week}`,
      label: `${monthValue}월`,
      week,
    });
  }

  return markers;
}

function insertYearMonthTransitionGaps(cells: HeatCell[]): HeatCell[] {
  const result: HeatCell[] = [];
  let hasVisibleInRangeCell = false;

  for (const cell of cells) {
    const isVisibleInRangeCell =
      !cell.isGap && cell.dateKey && (cell.inRange ?? true);
    const isMonthStart =
      isVisibleInRangeCell && Number(cell.dateKey.split("-")[2]) === 1;

    if (isMonthStart && hasVisibleInRangeCell) {
      result.push(...yearMonthGapCells(result.length));
    }

    result.push(cell);

    if (isVisibleInRangeCell) {
      hasVisibleInRangeCell = true;
    }
  }

  return result;
}

function yearMonthGapCells(offset: number): HeatCell[] {
  return Array.from({ length: 7 }, (_, index) => ({
    dateKey: `month-gap-${offset}-${index}`,
    durationSeconds: 0,
    bucket: 0,
    isGap: true,
  }));
}

/**
 * GitHub-style year heatmap: weekday rows with labels on the left, weeks as
 * columns inside a horizontal scroller that starts at the most recent week.
 * A 365-day range cannot use the calendar layout — 53 week rows would be
 * several screens tall.
 */
export function HeatYearGrid({
  cells,
  colorsOverride,
}: {
  cells: HeatCell[];
  colorsOverride?: ThemeColors;
}) {
  const { colors: themeColors } = useTheme();
  const colors = colorsOverride ?? themeColors;
  const scrollRef = useRef<ScrollView>(null);
  const renderCells = useMemo(
    () => insertYearMonthTransitionGaps(cells),
    [cells],
  );
  const weekCount = Math.ceil(renderCells.length / 7);
  const monthMarkers = useMemo(
    () => yearMonthMarkers(renderCells),
    [renderCells],
  );

  return (
    <View style={styles.yearWrap}>
      <View style={styles.yearLabels}>
        {cells.slice(0, 7).map((cell) => (
          <Text
            key={cell.dateKey}
            style={[styles.yearLabel, { color: colors.tx5 }]}
          >
            {weekdayLabel(cell.dateKey)}
          </Text>
        ))}
      </View>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: false })
        }
      >
        <View>
          <View style={styles.yearRows}>
            {Array.from({ length: 7 }, (_, weekday) => (
              <View key={weekday} style={styles.yearRow}>
                {Array.from({ length: weekCount }, (_, week) => {
                  const cell = renderCells[week * 7 + weekday];
                  return (
                    <View
                      key={week}
                      style={[
                        styles.yearCell,
                        {
                          backgroundColor:
                            cell && !cell.isGap
                              ? heatColor(
                                  colors,
                                  cell.bucket,
                                  cell.inRange ?? true,
                                )
                              : "transparent",
                        },
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>

          <View style={styles.yearMonthLabels}>
            {monthMarkers.map((marker) => (
              <Text
                key={marker.key}
                style={[
                  styles.yearMonthLabel,
                  {
                    color: colors.tx5,
                    left: marker.week * YEAR_COLUMN_WIDTH,
                  },
                ]}
              >
                {marker.label}
              </Text>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const LEGEND_BUCKETS = [0, 1, 2, 3, 4] as const;

export function HeatLegend({
  colorsOverride,
}: {
  colorsOverride?: ThemeColors;
}) {
  const { colors: themeColors } = useTheme();
  const colors = colorsOverride ?? themeColors;
  return (
    <View style={styles.legend}>
      <Text style={[styles.legendText, { color: colors.tx5 }]}>적음</Text>
      {LEGEND_BUCKETS.map((bucket) => (
        <View
          key={bucket}
          style={[
            styles.legendCell,
            { backgroundColor: heatColor(colors, bucket) },
          ]}
        />
      ))}
      <Text style={[styles.legendText, { color: colors.tx5 }]}>많음</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {},
  calendarRow: {
    flexDirection: "row",
    width: "100%",
  },
  calendarCell: {
    flex: 1,
    minWidth: 0,
    aspectRatio: 1,
  },
  weekdayHeader: {
    flexDirection: "row",
  },
  weekdayHeaderCell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  weekdayHeaderLabel: {
    ...typeScale.caption,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendText: {
    ...typeScale.caption,
  },
  legendCell: {
    width: 11,
    height: 11,
    borderRadius: 3,
  },
  yearWrap: {
    flexDirection: "row",
    gap: 6,
  },
  yearLabels: {
    gap: YEAR_GAP,
  },
  yearLabel: {
    height: YEAR_CELL,
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: YEAR_CELL,
  },
  yearRows: {
    gap: YEAR_GAP,
  },
  yearRow: {
    flexDirection: "row",
    gap: YEAR_GAP,
  },
  yearCell: {
    width: YEAR_CELL,
    height: YEAR_CELL,
    borderRadius: 3,
  },
  yearMonthLabels: {
    height: 16,
    marginTop: 6,
    position: "relative",
  },
  yearMonthLabel: {
    ...typeScale.caption,
    position: "absolute",
    top: 0,
  },
});
