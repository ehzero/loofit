import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { WIDGET_RENDERER_CONTRACT } from '@/src/widgets/widget-spec';
import type { WorkoutLockScreenCalendarWidgetProps } from '@/src/widgets/types';

const SPEC = WIDGET_RENDERER_CONTRACT.lockScreen.threeWeekCalendar;
export type LockScreenCalendarPalette = {
  primary: string;
  secondary: string;
  inverse: string;
};

export function LockScreenCalendarWidgetPreview({
  calendar,
  palette,
  style,
}: {
  calendar: WorkoutLockScreenCalendarWidgetProps;
  palette: LockScreenCalendarPalette;
  style?: StyleProp<ViewStyle>;
}) {
  const weekdayLabels = calendar.weekdayLabels.split(',').slice(0, SPEC.columns);
  const dateLabels = calendar.dateLabels.split(',');
  const heatLevels = calendar.heatLevels.split(',').map(Number);
  const todayFlags = calendar.todayFlags.split(',');
  const rows = Array.from({ length: SPEC.rangeWeeks }, (_, rowIndex) =>
    Array.from({ length: SPEC.columns }, (_, columnIndex) => {
      const index = rowIndex * SPEC.columns + columnIndex;
      return {
        dateLabel: dateLabels[index] ?? '',
        heatLevel: clampHeatLevel(heatLevels[index]),
        isToday: todayFlags[index] === '1',
      };
    })
  );

  return (
    <View style={[styles.container, style]}>
      <View style={styles.weekdayRow}>
        {weekdayLabels.map((label) => (
          <Text
            key={label}
            style={[
              styles.weekdayLabel,
              {
                color: SPEC.dimmedWeekdayLabels.includes(label as '일' | '토')
                  ? palette.secondary
                  : palette.primary,
              },
            ]}
          >
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.calendarRow}>
            {row.map((cell, columnIndex) => {
              const opacity =
                cell.heatLevel === 0 ? 0 : SPEC.bucketOpacities[cell.heatLevel - 1];
              return (
                <View
                  accessibilityLabel={`${cell.dateLabel}일, 운동 강도 ${cell.heatLevel}`}
                  accessible
                  key={`${rowIndex}-${columnIndex}`}
                  style={[
                    styles.dayCell,
                    {
                      backgroundColor:
                        cell.heatLevel === 0
                          ? SPEC.emptyCellFill
                          : colorWithOpacity(palette.primary, opacity),
                      borderColor: cell.isToday
                        ? SPEC.todayIndicator.color
                        : SPEC.emptyCellFill,
                      borderWidth: cell.isToday ? SPEC.todayIndicator.width : 0,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={SPEC.cellLabelMinimumScaleFactor}
                    style={[
                      styles.dayLabel,
                      { color: cell.heatLevel >= 3 ? palette.inverse : palette.primary },
                    ]}
                  >
                    {cell.dateLabel}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function clampHeatLevel(value: number): number {
  return Number.isFinite(value) ? Math.min(4, Math.max(0, Math.round(value))) : 0;
}

function colorWithOpacity(color: string, opacity: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) {
    return color;
  }
  return `rgba(${Number.parseInt(match[1], 16)},${Number.parseInt(match[2], 16)},${Number.parseInt(
    match[3],
    16
  )},${opacity})`;
}

const styles = StyleSheet.create({
  container: {
    gap: SPEC.cellGap,
    padding: SPEC.contentPadding,
  },
  weekdayRow: {
    flexDirection: 'row',
    gap: SPEC.cellGap,
    height: SPEC.weekdayLabelLineHeight,
  },
  weekdayLabel: {
    flex: 1,
    fontSize: SPEC.weekdayLabelSize,
    fontWeight: WIDGET_RENDERER_CONTRACT.designSystem.fontWeight.bold,
    lineHeight: SPEC.weekdayLabelLineHeight,
    minWidth: 0,
    textAlign: 'center',
  },
  grid: {
    flex: 1,
    gap: SPEC.cellGap,
  },
  calendarRow: {
    flex: 1,
    flexDirection: 'row',
    gap: SPEC.cellGap,
  },
  dayCell: {
    alignItems: 'center',
    borderRadius: SPEC.cellRadius,
    flex: 1,
    justifyContent: 'center',
    minHeight: 0,
    minWidth: 0,
  },
  dayLabel: {
    fontSize: SPEC.cellLabelSize,
    fontVariant: ['tabular-nums'],
    fontWeight: WIDGET_RENDERER_CONTRACT.designSystem.fontWeight.bold,
    lineHeight: SPEC.weekdayLabelLineHeight,
    textAlign: 'center',
  },
});
