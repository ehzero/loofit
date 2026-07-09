import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/src/theme/ThemeProvider';

import { Icon } from './Icon';

type ScreenProps = PropsWithChildren<{
  title?: string;
  onBack?: () => void;
  headerRight?: ReactNode;
  isLoading?: boolean;
  scroll?: boolean;
  /** Optional background override (e.g. widget preview uses a dark gradient-like fill). */
  background?: string;
}>;

export function Screen({
  title,
  onBack,
  headerRight,
  isLoading,
  scroll = true,
  background,
  children,
}: ScreenProps) {
  const { colors } = useTheme();
  const bg = background ?? colors.bg;

  const header =
    title || onBack || headerRight ? (
      <View style={styles.header}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10} style={styles.back}>
            <Icon name="chevronLeft" size={24} color={colors.tx2} weight="semibold" />
          </Pressable>
        ) : null}
        {title ? (
          <Text style={[styles.title, { color: colors.tx, marginLeft: onBack ? 4 : 0 }]}>{title}</Text>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {headerRight ?? null}
      </View>
    ) : null;

  const body = isLoading ? (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
    </View>
  ) : (
    children
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bg }]} edges={['top']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          {header}
          {body}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.flexContent]}>
          {header}
          {body}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
    gap: 20,
  },
  flexContent: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  back: {
    padding: 4,
    marginLeft: -4,
  },
  title: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  loading: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
