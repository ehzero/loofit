import { Pressable, StyleSheet, View } from 'react-native';

import { formatDateK, formatDuration } from '@/src/domain/date';
import { joinPartNames } from '@/src/domain/routine';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing } from '@/src/theme/tokens';
import type { WorkoutSession } from '@/src/types';

import { AppText } from './AppText';

export function RecordRow({
  session,
  onPress,
  compact,
}: {
  session: WorkoutSession;
  onPress?: () => void;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const title = joinPartNames(session.parts.map((part) => ({ name: part.bodyPartName })));
  const tag = session.routineDayId ? '루틴' : '자유';

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          paddingVertical: compact ? spacing.sm : spacing.md,
        },
      ]}>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <AppText variant="item" weight="800" numberOfLines={1} style={styles.title}>
            {title}
          </AppText>
          {compact ? (
            <AppText variant="label" tone="faint">
              {tag}
            </AppText>
          ) : (
            <View style={[styles.tagBox, { borderColor: colors.border2 }]}>
              <AppText variant="label" tone="faint">
                {tag}
              </AppText>
            </View>
          )}
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
            {!compact ? (
              <AppText variant="label" tone="muted">
                완료
              </AppText>
            ) : null}
          </>
        ) : session.status === 'canceled' ? (
          <AppText variant="footnote" weight="700" tone="faint">
            {compact ? '취소' : '취소됨'}
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
  tagBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: spacing.xxs,
  },
});
