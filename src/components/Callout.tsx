import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

/**
 * Inline informational box: an icon plus a short explanation. Pass nested
 * AppText elements as children for emphasized fragments.
 */
export function Callout({
  icon,
  tone = 'muted',
  children,
}: {
  icon: IconName;
  /** accent: highlighted guidance (routine hint). muted: neutral notice. */
  tone?: 'accent' | 'muted';
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Icon name={icon} size={18} color={tone === 'accent' ? colors.accent : colors.tx4} />
      <AppText
        variant="footnote"
        weight="500"
        tone="secondary"
        wordBreak
        style={styles.text}>
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.sm,
  },
  text: {
    flex: 1,
  },
});
