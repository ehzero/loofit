import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { providerColors, radius, spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';

type ButtonVariant =
  | 'accent'
  | 'neutral'
  | 'ghost'
  | 'danger'
  | 'dangerSolid'
  | 'kakao';

type ButtonProps = {
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  size?: 'md' | 'lg';
  style?: ViewStyle;
  leadingIcon?: ReactNode;
  children: ReactNode;
};

export function Button({
  onPress,
  variant = 'accent',
  disabled,
  size = 'lg',
  style,
  leadingIcon,
  children,
}: ButtonProps) {
  const { colors } = useTheme();
  const isProvider = variant === 'kakao';

  const background =
    variant === 'accent'
      ? colors.accent
      : variant === 'kakao'
        ? providerColors.kakaoBackground
        : variant === 'neutral'
          ? colors.surface2
          : variant === 'dangerSolid'
            ? colors.dangerSolid
            : 'transparent';
  const tone =
    variant === 'accent' ? 'accentContrast' : variant === 'danger' ? 'danger' : 'secondary';
  const borderColor = variant === 'ghost' ? colors.border2 : 'transparent';
  // dangerSolid needs fixed white for contrast on the solid red.
  const labelStyle =
    variant === 'dangerSolid'
      ? { color: '#FFFFFF' }
      : variant === 'kakao'
        ? { color: providerColors.kakaoText }
        : null;

  const label = (
    <AppText
      variant={isProvider ? 'providerCta' : size === 'lg' ? 'cta' : 'body'}
      weight={isProvider ? undefined : '800'}
      tone={tone}
      style={labelStyle}>
      {children}
    </AppText>
  );

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' ? styles.lg : styles.md,
        isProvider ? styles.provider : null,
        { backgroundColor: background, borderColor, borderWidth: variant === 'ghost' ? 1 : 0 },
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}>
      <View style={styles.content}>
        {leadingIcon}
        {label}
      </View>
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
  provider: {
    height: 44,
    minHeight: 44,
    borderRadius: radius.md,
    paddingVertical: 0,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
});
