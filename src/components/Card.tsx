import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';

type CardProps = PropsWithChildren<{
  title?: string;
  action?: ReactNode;
  style?: ViewStyle;
  /** hero: larger radius/padding for the home headline card. */
  variant?: 'default' | 'hero';
  padding?: number;
  gap?: number;
}>;

export function Card({
  title,
  action,
  style,
  variant = 'default',
  padding,
  gap = spacing.sm,
  children,
}: CardProps) {
  const { colors } = useTheme();
  const isHero = variant === 'hero';
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: isHero ? radius.xl : radius.lg,
          padding: padding ?? (isHero ? spacing.lg : spacing.md),
          gap: isHero ? spacing.md : gap,
        },
        style,
      ]}>
      {title || action ? (
        <View style={styles.header}>
          {title ? (
            <AppText variant="label" tone="muted">
              {title}
            </AppText>
          ) : (
            <View />
          )}
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
