import { Pressable, StyleSheet, View } from 'react-native';

import { formatDateK, formatDuration } from '@/src/domain/date';
import { workoutSessionDisplayName } from '@/src/domain/routine';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing } from '@/src/theme/tokens';
import type { WorkoutSession } from '@/src/types';

import { AppText } from './AppText';
import { Badge } from './Badge';

/** The one session row used everywhere a record is listed (home, records). */
export function RecordRow({
  session,
  onPress,
}: {
  session: WorkoutSession;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const title = workoutSessionDisplayName(session);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <AppText variant="item" weight="800" numberOfLines={1} style={styles.title}>
            {title}
          </AppText>
          <Badge label={session.routineDayId ? '루틴' : '자유'} />
        </View>
        <AppText variant="label" weight="600" tone="muted">
          {formatDateK(session.startedAt)}
        </AppText>
      </View>

      <View style={styles.trailing}>
        {session.status === 'completed' ? (
          <>
            <AppText variant="item" weight="800" tone="accent">
              {formatDuration(session.durationSeconds)}
            </AppText>
            <AppText variant="label" tone="muted">
              완료
            </AppText>
          </>
        ) : session.status === 'canceled' ? (
          <AppText variant="footnote" weight="700" tone="faint">
            취소됨
          </AppText>
        ) : (
          <AppText variant="footnote" weight="700" tone="warning">
            진행 중
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    flexShrink: 1,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: spacing.xxs,
  },
});
