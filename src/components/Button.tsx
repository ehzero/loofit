import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';

type ButtonVariant = 'accent' | 'neutral' | 'ghost' | 'danger';

type ButtonProps = {
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  size?: 'md' | 'lg';
  style?: ViewStyle;
  children: ReactNode;
};

export function Button({
  onPress,
  variant = 'accent',
  disabled,
  size = 'lg',
  style,
  children,
}: ButtonProps) {
  const { colors } = useTheme();

  const background =
    variant === 'accent'
      ? colors.accent
      : variant === 'neutral'
        ? colors.surface2
        : 'transparent';
  const tone =
    variant === 'accent' ? 'accentContrast' : variant === 'danger' ? 'danger' : 'secondary';
  const borderColor = variant === 'ghost' ? colors.border2 : 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' ? styles.lg : styles.md,
        { backgroundColor: background, borderColor, borderWidth: variant === 'ghost' ? 1 : 0 },
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}>
      <AppText variant={size === 'lg' ? 'cta' : 'body'} weight="800" tone={tone}>
        {children}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lg: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 54,
  },
  md: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
});
