import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { Panel } from '@/src/components/Panel';
import { RoutineDayRow } from '@/src/components/Rows';
import { Screen } from '@/src/components/Screen';
import { formatDuration } from '@/src/domain/date';
import { joinPartNames } from '@/src/domain/routine';
import { useAppStore } from '@/src/store/app-store';
import { theme } from '@/src/styles/theme';
import type { BodyPart } from '@/src/types';

export default function SessionScreen() {
  const router = useRouter();
  const overview = useAppStore((state) => state.overview);
  const completeActive = useAppStore((state) => state.completeActive);
  const cancelActive = useAppStore((state) => state.cancelActive);
  const changeActive = useAppStore((state) => state.changeActive);
  const [selectedFreeParts, setSelectedFreeParts] = useState<number[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const active = overview?.activeSession ?? null;
  const elapsedSeconds = useMemo(() => {
    if (!active) {
      return 0;
    }
    return Math.max(0, Math.floor((now - new Date(active.startedAt).getTime()) / 1000));
  }, [active, now]);

  async function finish() {
    await completeActive();
    router.replace('/');
  }

  async function cancel() {
    await cancelActive();
    router.replace('/');
  }

  if (!active || !overview) {
    return (
      <Screen title="운동 중" subtitle="진행 중인 운동이 없습니다.">
        <Panel>
          <AppButton onPress={() => router.replace('/')}>홈으로 돌아가기</AppButton>
        </Panel>
      </Screen>
    );
  }

  const activeTitle = joinPartNames(active.parts.map((part) => ({ name: part.bodyPartName })));

  return (
    <Screen title="운동 중" subtitle="앱을 닫아도 active 세션은 그대로 유지됩니다.">
      <Panel>
        <Text style={styles.status}>운동 중</Text>
        <Text style={styles.title}>{activeTitle}</Text>
        <Text style={styles.timer}>{formatDuration(elapsedSeconds)}</Text>
        <View style={styles.actions}>
          <AppButton onPress={finish}>운동 종료</AppButton>
          <AppButton variant="ghost" onPress={cancel}>
            운동 취소
          </AppButton>
        </View>
      </Panel>

      <Panel title="루틴 운동으로 변경">
        {overview.routineDays.length === 0 ? (
          <Text style={styles.muted}>설정된 루틴이 없습니다.</Text>
        ) : (
          overview.routineDays.map((day) => (
            <RoutineDayRow
              key={day.id}
              day={day}
              isNext={day.id === active.routineDayId}
              onPress={() => changeActive({ kind: 'routine', routineDayId: day.id })}
            />
          ))
        )}
      </Panel>

      <Panel title="자유 운동으로 변경">
        <View style={styles.chipWrap}>
          {overview.bodyParts.map((part) => (
            <BodyPartChip
              key={part.id}
              part={part}
              selected={selectedFreeParts.includes(part.id)}
              onPress={() =>
                setSelectedFreeParts((current) =>
                  current.includes(part.id)
                    ? current.filter((id) => id !== part.id)
                    : [...current, part.id]
                )
              }
            />
          ))}
        </View>
        <AppButton
          variant="secondary"
          disabled={selectedFreeParts.length === 0}
          onPress={() => changeActive({ kind: 'free', bodyPartIds: selectedFreeParts })}>
          선택한 자유 운동으로 변경
        </AppButton>
      </Panel>
    </Screen>
  );
}

function BodyPartChip({
  part,
  selected,
  onPress,
}: {
  part: BodyPart;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        selected ? { backgroundColor: part.color, borderColor: part.color } : null,
      ]}>
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{part.name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  status: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  timer: {
    color: theme.colors.text,
    fontSize: 44,
    fontWeight: '900',
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  muted: {
    color: theme.colors.muted,
    fontSize: 14,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    borderColor: theme.colors.border,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  chipText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
});
