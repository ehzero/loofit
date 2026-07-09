import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';

type Tile = { label: string; value: string };

export function StatTiles({ tiles }: { tiles: Tile[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {tiles.map((tile) => (
        <View
          key={tile.label}
          style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <AppText variant="label" tone="muted">
            {tile.label}
          </AppText>
          <AppText variant="display">{tile.value}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tile: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
