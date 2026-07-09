import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '@/src/domain/date';
import { joinPartNames } from '@/src/domain/routine';
import { theme } from '@/src/styles/theme';
import type { RoutineDay, WorkoutSession } from '@/src/types';

export function RoutineDayRow({
  day,
  isNext,
  onPress,
}: {
  day: RoutineDay;
  isNext?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.row, isNext ? styles.highlight : null]}>
      <View style={styles.rowText}>
        <Text style={styles.title}>{day.name}</Text>
        <Text style={styles.subtitle}>{joinPartNames(day.parts)}</Text>
      </View>
      {isNext ? <Text style={styles.badge}>추천</Text> : null}
    </Pressable>
  );
}

export function SessionRow({
  session,
  onPress,
}: {
  session: WorkoutSession;
  onPress?: () => void;
}) {
  const title = joinPartNames(session.parts.map((part) => ({ name: part.bodyPartName })));
  const statusLabel =
    session.status === 'active' ? '운동 중' : session.status === 'canceled' ? '취소됨' : '완료';

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {new Date(session.startedAt).toLocaleString()} · {statusLabel}
        </Text>
      </View>
      <Text style={styles.duration}>{formatDuration(session.durationSeconds)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  highlight: {
    backgroundColor: '#ECF8F5',
    borderColor: theme.colors.primary,
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  badge: {
    backgroundColor: theme.colors.primary,
    borderRadius: 999,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  duration: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
});
