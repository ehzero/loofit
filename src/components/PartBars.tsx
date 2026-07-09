import { StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '@/src/domain/date';
import { useTheme } from '@/src/theme/ThemeProvider';

type PartStat = { name: string; durationSeconds: number };

export function PartBars({ stats }: { stats: PartStat[] }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...stats.map((stat) => stat.durationSeconds));

  return (
    <View style={styles.list}>
      {stats.map((stat) => (
        <View key={stat.name} style={styles.item}>
          <View style={styles.labelRow}>
            <Text style={[styles.name, { color: colors.tx2 }]}>{stat.name}</Text>
            <Text style={[styles.duration, { color: colors.tx4 }]}>
              {formatDuration(stat.durationSeconds)}
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: colors.chip }]}>
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: colors.accent,
                  width: `${Math.round((stat.durationSeconds / max) * 100)}%`,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 15,
  },
  item: {
    gap: 7,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
  },
  duration: {
    fontSize: 13,
    fontWeight: '700',
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
});
