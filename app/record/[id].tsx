import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { Panel } from '@/src/components/Panel';
import { RoutineDayRow } from '@/src/components/Rows';
import { Screen } from '@/src/components/Screen';
import { getSessionById } from '@/src/db/repository';
import { formatDuration } from '@/src/domain/date';
import { joinPartNames } from '@/src/domain/routine';
import { useAppStore } from '@/src/store/app-store';
import { theme } from '@/src/styles/theme';
import type { BodyPart, SessionStatus, WorkoutSession } from '@/src/types';

export default function RecordDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const overview = useAppStore((state) => state.overview);
  const updateRecord = useAppStore((state) => state.updateRecord);
  const deleteRecord = useAppStore((state) => state.deleteRecord);
  const id = Number(params.id);
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>('completed');
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const [note, setNote] = useState('');
  const [routineDayId, setRoutineDayId] = useState<number | null | undefined>(undefined);
  const [freePartIds, setFreePartIds] = useState<number[]>([]);

  useEffect(() => {
    getSessionById(id).then((record) => {
      if (!record) {
        return;
      }
      setSession(record);
      setStatus(record.status);
      setStartedAt(record.startedAt);
      setEndedAt(record.endedAt ?? '');
      setNote(record.note ?? '');
      setRoutineDayId(record.routineDayId);
      setFreePartIds(record.parts.map((part) => part.bodyPartId).filter((partId): partId is number => !!partId));
    });
  }, [id, overview]);

  const durationPreview = useMemo(() => {
    if (!endedAt || status === 'active') {
      return 0;
    }
    return Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  }, [endedAt, startedAt, status]);

  if (!session || !overview) {
    return <Screen title="기록 상세" isLoading />;
  }

  async function save() {
    await updateRecord(id, {
      status,
      startedAt,
      endedAt: status === 'active' ? null : endedAt || new Date().toISOString(),
      note,
      routineDayId: routineDayId ?? null,
      bodyPartIds: routineDayId ? undefined : freePartIds,
    });
    router.back();
  }

  async function remove() {
    await deleteRecord(id);
    router.replace('/records');
  }

  return (
    <Screen title="기록 상세" subtitle={joinPartNames(session.parts.map((part) => ({ name: part.bodyPartName })))}>
      <Panel title="상태">
        <View style={styles.segment}>
          {(['completed', 'canceled', 'active'] as SessionStatus[]).map((value) => (
            <Pressable
              key={value}
              onPress={() => setStatus(value)}
              style={[styles.segmentItem, status === value ? styles.segmentActive : null]}>
              <Text style={[styles.segmentText, status === value ? styles.segmentTextActive : null]}>
                {value === 'completed' ? '완료' : value === 'canceled' ? '취소' : '진행 중'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.muted}>예상 운동 시간: {formatDuration(durationPreview)}</Text>
      </Panel>

      <Panel title="시간">
        <Text style={styles.label}>시작 시간 ISO</Text>
        <TextInput value={startedAt} onChangeText={setStartedAt} style={styles.input} />
        <Text style={styles.label}>종료 시간 ISO</Text>
        <TextInput
          value={endedAt}
          onChangeText={setEndedAt}
          editable={status !== 'active'}
          placeholder="진행 중이면 비워둡니다"
          style={styles.input}
        />
      </Panel>

      <Panel title="루틴 운동으로 변경">
        {overview.routineDays.map((day) => (
          <RoutineDayRow
            key={day.id}
            day={day}
            isNext={routineDayId === day.id}
            onPress={() => setRoutineDayId(day.id)}
          />
        ))}
      </Panel>

      <Panel title="자유 운동으로 변경">
        <View style={styles.chipWrap}>
          {overview.bodyParts.map((part) => (
            <BodyPartChip
              key={part.id}
              part={part}
              selected={routineDayId === null && freePartIds.includes(part.id)}
              onPress={() => {
                setRoutineDayId(null);
                setFreePartIds((current) =>
                  current.includes(part.id)
                    ? current.filter((partId) => partId !== part.id)
                    : [...current, part.id]
                );
              }}
            />
          ))}
        </View>
      </Panel>

      <Panel title="메모">
        <TextInput
          multiline
          value={note}
          onChangeText={setNote}
          placeholder="선택 사항"
          style={[styles.input, styles.note]}
        />
      </Panel>

      <View style={styles.actions}>
        <AppButton onPress={save}>저장</AppButton>
        <AppButton variant="danger" onPress={remove}>
          기록 삭제
        </AppButton>
      </View>
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
  segment: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    flexDirection: 'row',
    padding: 3,
  },
  segmentItem: {
    alignItems: 'center',
    borderRadius: theme.radius.sm,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: theme.colors.surface,
  },
  segmentText: {
    color: theme.colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: theme.colors.text,
  },
  label: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: theme.colors.text,
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
  },
  note: {
    minHeight: 88,
    paddingTop: theme.spacing.md,
  },
  muted: {
    color: theme.colors.muted,
    fontSize: 13,
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
  actions: {
    gap: theme.spacing.md,
  },
});
