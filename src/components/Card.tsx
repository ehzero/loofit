import type { PropsWithChildren, ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
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
  const content = (
    <>
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
    </>
  );
  const cardStyle = [
    styles.card,
    {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: isHero ? radius.xl : radius.lg,
      padding: padding ?? (isHero ? spacing.lg : spacing.md),
      gap: isHero ? spacing.md : gap,
    },
    style,
  ];

  if (isHero) {
    return (
      <LinearGradient
        colors={[colors.g1, colors.g2]}
        start={{ x: 0.39, y: 0 }}
        end={{ x: 0.61, y: 1 }}
        style={cardStyle}>
        {content}
      </LinearGradient>
    );
  }

  return (
    <View style={cardStyle}>
      {content}
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
