import type { PropsWithChildren, ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';

type CardProps = PropsWithChildren<{
  title?: string;
  action?: ReactNode;
  style?: ViewStyle;
  padding?: number;
  gap?: number;
}>;

export function Card({ title, action, style, padding = 16, gap = 13, children }: CardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border, padding, gap },
        style,
      ]}>
      {title || action ? (
        <View style={styles.header}>
          {title ? (
            <Text style={[styles.title, { color: colors.tx4 }]}>{title}</Text>
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
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
  },
});
