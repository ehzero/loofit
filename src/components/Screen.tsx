import type { PropsWithChildren, ReactElement, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/src/theme/ThemeProvider';
import { spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';
import { Icon } from './Icon';

type ScreenProps = PropsWithChildren<{
  title?: string;
  onBack?: () => void;
  headerRight?: ReactNode;
  isLoading?: boolean;
  scroll?: boolean;
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Optional background override (e.g. widget preview uses a dark fill). */
  background?: string;
}>;

export function Screen({
  title,
  onBack,
  headerRight,
  isLoading,
  scroll = true,
  refreshControl,
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
          <AppText variant="display" style={[styles.title, onBack ? styles.titleAfterBack : null]}>
            {title}
          </AppText>
        ) : (
          <View style={styles.spacer} />
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
          refreshControl={refreshControl}
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
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  flexContent: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  back: {
    padding: spacing.xxs,
    marginLeft: -spacing.xxs,
  },
  title: {
    flex: 1,
  },
  titleAfterBack: {
    marginLeft: spacing.xxs,
  },
  spacer: {
    flex: 1,
  },
  loading: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
