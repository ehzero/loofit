import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';

/** Static, read-only pill (e.g. body-part tags). */
export function Tag({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: colors.chip, borderColor: colors.border2 }]}>
      <AppText variant="footnote" weight="700" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

/** Selectable pill used across free-workout / part pickers. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: selected ? colors.accent : colors.surface2,
          borderColor: selected ? colors.accent : colors.border2,
        },
      ]}>
      <AppText variant="footnote" weight="700" tone={selected ? 'accentContrast' : 'secondary'}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
