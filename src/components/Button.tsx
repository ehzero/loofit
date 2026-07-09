import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';

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
  const textColor =
    variant === 'accent'
      ? colors.accentText
      : variant === 'danger'
        ? colors.danger
        : colors.tx2;
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
      <Text style={[size === 'lg' ? styles.labelLg : styles.labelMd, { color: textColor }]}>
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lg: {
    borderRadius: 16,
    paddingVertical: 17,
    paddingHorizontal: 18,
    minHeight: 54,
  },
  md: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
  labelLg: {
    fontSize: 17,
    fontWeight: '800',
  },
  labelMd: {
    fontSize: 14,
    fontWeight: '700',
  },
});
