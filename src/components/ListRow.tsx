import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';

type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Trailing accessory; `chevron` renders the standard disclosure arrow. */
  right?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /**
   * `grouped`: transparent row inside a Card group (settings-style).
   * `card`: self-contained surface row (sheets, pickers).
   */
  variant?: 'grouped' | 'card';
  /**
   * card rows only — which surface the row sits on (see tokens.ts surface
   * hierarchy): `surface2` inside a card container, `card` directly on bg.
   */
  surface?: 'surface2' | 'card';
  /** grouped rows only: draw a hairline under the row. */
  divider?: boolean;
};

export function ListRow({
  title,
  subtitle,
  right,
  chevron,
  onPress,
  disabled,
  variant = 'grouped',
  surface = 'surface2',
  divider,
}: ListRowProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={[
        styles.row,
        variant === 'card'
          ? {
              backgroundColor: surface === 'card' ? colors.card : colors.surface2,
              borderColor: surface === 'card' ? colors.border : colors.border2,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: surface === 'card' ? radius.lg : radius.md,
            }
          : null,
        divider && variant === 'grouped'
          ? { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth }
          : null,
        disabled ? styles.disabled : null,
      ]}>
      <View style={styles.text}>
        <AppText variant="item" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="label" tone="muted" weight="600" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ?? (chevron ? <Icon name="chevronRight" size={18} color={colors.tx5} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
  disabled: {
    opacity: 0.45,
  },
});
