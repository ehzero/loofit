import { StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '@/src/domain/date';
import { theme } from '@/src/styles/theme';
import type { HeatmapDay } from '@/src/types';

const BUCKET_COLORS = [
  '#E5EAF0',
  '#BFE7D7',
  '#78C6A3',
  '#2A9D8F',
  '#176B5F',
] as const;

export function Heatmap({ days }: { days: HeatmapDay[] }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        {days.map((day) => (
          <View
            key={day.dateKey}
            accessibilityLabel={`${day.dateKey} ${formatDuration(day.durationSeconds)}`}
            style={[styles.cell, { backgroundColor: BUCKET_COLORS[day.bucket] }]}
          />
        ))}
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendText}>적음</Text>
        <View style={styles.legendCells}>
          {BUCKET_COLORS.slice(1).map((color) => (
            <View key={color} style={[styles.legendCell, { backgroundColor: color }]} />
          ))}
        </View>
        <Text style={styles.legendText}>많음</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: theme.spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  cell: {
    aspectRatio: 1,
    borderRadius: 3,
    width: 18,
  },
  legend: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  legendCells: {
    flexDirection: 'row',
    gap: 4,
  },
  legendCell: {
    borderRadius: 2,
    height: 10,
    width: 10,
  },
  legendText: {
    color: theme.colors.muted,
    fontSize: 12,
  },
});
