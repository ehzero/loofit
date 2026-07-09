import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/AppText';
import { useTheme } from '@/src/theme/ThemeProvider';
import { spacing } from '@/src/theme/tokens';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: '화면 없음' }} />
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <AppText variant="title">화면을 찾을 수 없습니다.</AppText>

        <Link href="/" style={styles.link}>
          <AppText variant="body" weight="700" tone="accent">
            홈으로 돌아가기
          </AppText>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  link: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
  },
});
