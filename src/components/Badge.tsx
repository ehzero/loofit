import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';

/**
 * Tiny status/category marker.
 * accent: emphasized ("다음"). outline: quiet category tag ("루틴"/"자유").
 */
export function Badge({
  label,
  variant = 'outline',
}: {
  label: string;
  variant?: 'accent' | 'outline';
}) {
  const { colors } = useTheme();
  const accent = variant === 'accent';
  return (
    <View
      style={[
        styles.badge,
        accent
          ? { backgroundColor: colors.accent }
          : { borderColor: colors.border2, borderWidth: StyleSheet.hairlineWidth },
      ]}>
      <AppText variant="label" tone={accent ? 'accentContrast' : 'faint'}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.xs,
    paddingHorizontal: spacing.xxs + 2,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
});
