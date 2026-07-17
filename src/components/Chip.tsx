import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';

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

/** Selectable pill used across body-part pickers. */
export function Chip({
  label,
  selected,
  onPress,
  onRemove,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Renders a trailing ✕; turns the chip into a removable pill. */
  onRemove?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.pill,
        onRemove ? styles.removable : null,
        {
          backgroundColor: selected ? colors.accent : colors.surface2,
          borderColor: selected ? colors.accent : colors.border2,
        },
      ]}>
      <AppText variant="footnote" weight="700" tone={selected ? 'accentContrast' : 'secondary'}>
        {label}
      </AppText>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={6}>
          <Icon name="close" size={14} color={colors.tx4} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  removable: {
    paddingRight: spacing.xs,
  },
});
