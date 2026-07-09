import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDateK, formatDuration } from '@/src/domain/date';
import { joinPartNames } from '@/src/domain/routine';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { WorkoutSession } from '@/src/types';

const ACTIVE_COLOR = '#F5A623';

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
          padding: compact ? 14 : 16,
          paddingHorizontal: 16,
        },
      ]}>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.tx }]} numberOfLines={1}>
            {title}
          </Text>
          {compact ? (
            <Text style={[styles.tagPlain, { color: colors.tx5 }]}>{tag}</Text>
          ) : (
            <View style={[styles.tagBox, { borderColor: colors.border2 }]}>
              <Text style={[styles.tagBoxText, { color: colors.tx5 }]}>{tag}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.date, { color: colors.tx4 }]}>{formatDateK(session.startedAt)}</Text>
      </View>

      <View style={styles.trailing}>
        {session.status === 'completed' ? (
          <>
            <Text style={[styles.duration, { color: colors.accent }]}>
              {formatDuration(session.durationSeconds)}
            </Text>
            {!compact ? <Text style={[styles.statusLabel, { color: colors.tx4 }]}>완료</Text> : null}
          </>
        ) : session.status === 'canceled' ? (
          <Text style={[styles.statusMuted, { color: colors.tx5 }]}>
            {compact ? '취소' : '취소됨'}
          </Text>
        ) : (
          <Text style={[styles.statusActive, { color: ACTIVE_COLOR }]}>진행 중</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  tagPlain: {
    fontSize: 11,
    fontWeight: '700',
  },
  tagBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagBoxText: {
    fontSize: 11,
    fontWeight: '700',
  },
  date: {
    fontSize: 12,
    fontWeight: '600',
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 6,
  },
  duration: {
    fontSize: 15,
    fontWeight: '800',
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusMuted: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusActive: {
    fontSize: 13,
    fontWeight: '700',
  },
});
