import { StyleSheet, View } from 'react-native';

import { formatDuration } from '@/src/domain/date';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';

type DurationStat = {
  name: string;
  durationSeconds: number;
  detail?: string;
};

export function DurationBars({ stats }: { stats: DurationStat[] }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...stats.map((stat) => stat.durationSeconds));

  return (
    <View style={styles.list}>
      {stats.map((stat) => (
        <View key={stat.name} style={styles.item}>
          <View style={styles.labelRow}>
            <AppText variant="footnote" weight="700" tone="secondary">
              {stat.name}
            </AppText>
            <AppText variant="footnote" weight="700" tone="muted">
              {[stat.detail, formatDuration(stat.durationSeconds)].filter(Boolean).join(' · ')}
            </AppText>
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
    gap: spacing.md,
  },
  item: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
});
