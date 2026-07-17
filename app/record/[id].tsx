import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/AppText';
import { Button } from '@/src/components/Button';
import { Callout } from '@/src/components/Callout';
import { ConfirmDialog, type ConfirmConfig } from '@/src/components/ConfirmDialog';
import { IconButton } from '@/src/components/IconButton';
import { Input } from '@/src/components/Input';
import { Screen } from '@/src/components/Screen';
import { Segmented } from '@/src/components/Segmented';
import { getSessionById } from '@/src/db/repository';
import { formatClock, formatDateK, formatDuration } from '@/src/domain/date';
import { routineDayDisplayName } from '@/src/domain/routine';
import {
  isActionSuccessful,
  shouldDismissAfterAction,
  useAppStore,
} from '@/src/store/app-store';
import { appOperationCoordinator } from '@/src/store/app-operation-coordinator';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/theme/ToastProvider';
import { radius, spacing } from '@/src/theme/tokens';
import type { SessionStatus } from '@/src/types';

const STATUS_OPTIONS: Array<{ value: SessionStatus; label: string }> = [
  { value: 'completed', label: '완료' },
  { value: 'active', label: '진행 중' },
  { value: 'canceled', label: '취소' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export default function RecordDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const { colors } = useTheme();
  const { showToast } = useToast();

  const overview = useAppStore((state) => state.overview);
  const updateRecord = useAppStore((state) => state.updateRecord);
  const deleteRecord = useAppStore((state) => state.deleteRecord);

  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SessionStatus>('completed');
  const [startAt, setStartAt] = useState<Date>(new Date());
  const [endAt, setEndAt] = useState<Date>(new Date());
  const [note, setNote] = useState('');
  const [routineDayId, setRoutineDayId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  useEffect(() => {
    appOperationCoordinator.runInPipeline(() => getSessionById(id)).then((record) => {
      if (!record) {
        return;
      }
      setStatus(record.status);
      setStartAt(new Date(record.startedAt));
      setEndAt(record.endedAt ? new Date(record.endedAt) : new Date());
      setNote(record.note ?? '');
      setRoutineDayId(record.routineDayId);
      setLoaded(true);
    });
  }, [id]);

  // An end time at or before the start means the workout crossed midnight;
  // roll the end forward a day so the preview and the saved record agree.
  const effectiveEndAt = useMemo(
    () => (endAt.getTime() <= startAt.getTime() ? new Date(endAt.getTime() + DAY_MS) : endAt),
    [startAt, endAt]
  );

  const durationSeconds = useMemo(
    () => Math.max(0, Math.floor((effectiveEndAt.getTime() - startAt.getTime()) / 1000)),
    [startAt, effectiveEndAt]
  );

  if (!loaded || !overview) {
    return <Screen title="기록 수정" onBack={() => router.back()} isLoading />;
  }

  function shiftDate(days: number) {
    setStartAt((prev) => new Date(prev.getTime() + days * DAY_MS));
    setEndAt((prev) => new Date(prev.getTime() + days * DAY_MS));
  }

  function adjustTime(which: 'start' | 'end', unit: 'hour' | 'minute', delta: number) {
    const setter = which === 'start' ? setStartAt : setEndAt;
    setter((prev) => {
      const next = new Date(prev);
      if (unit === 'hour') {
        next.setHours(next.getHours() + delta);
      } else {
        next.setMinutes(next.getMinutes() + delta);
      }
      return next;
    });
  }

  async function save() {
    const result = await updateRecord(id, {
      status,
      startedAt: startAt.toISOString(),
      endedAt: status === 'active' ? null : effectiveEndAt.toISOString(),
      note,
      routineDayId: routineDayId ?? undefined,
    });
    if (isActionSuccessful(result)) {
      showToast('기록이 수정되었어요');
    }
    if (shouldDismissAfterAction(result)) {
      router.back();
    }
  }

  const durationLabel = status === 'canceled' ? '취소됨' : formatDuration(durationSeconds);

  return (
    <>
      <Screen title="기록 수정" onBack={() => router.back()}>
        {/* Status */}
        <Field label="상태">
          <Segmented
            options={STATUS_OPTIONS}
            value={status}
            onChange={(next) => {
              const otherActive =
                overview.activeSession && overview.activeSession.id !== id;
              if (next === 'active' && otherActive) {
                showToast('이미 진행 중인 운동이 있어요');
                return;
              }
              setStatus(next);
            }}
          />
        </Field>

        {/* Date & time */}
        <Field label="날짜 · 시간">
          <StepperRow
            value={formatDateK(startAt)}
            onDec={() => shiftDate(-1)}
            onInc={() => shiftDate(1)}
          />
          <View style={styles.timeRow}>
            <TimeStepper
              caption="시작"
              value={formatClock(startAt)}
              onHour={(d) => adjustTime('start', 'hour', d)}
              onMinute={(d) => adjustTime('start', 'minute', d)}
            />
            <TimeStepper
              caption="종료"
              value={formatClock(endAt)}
              disabled={status === 'active'}
              onHour={(d) => adjustTime('end', 'hour', d)}
              onMinute={(d) => adjustTime('end', 'minute', d)}
            />
          </View>
          <View style={styles.durationRow}>
            <AppText variant="footnote" tone="muted">
              운동 시간
            </AppText>
            <AppText variant="item" weight="800" tone="accent">
              {durationLabel}
            </AppText>
          </View>
        </Field>

        {/* Target */}
        <Field label="운동 대상">
          <View style={styles.targetList}>
            {overview.routineDays.map((day) => {
              const selected = routineDayId === day.id;
              return (
                <Pressable
                  key={day.id}
                  onPress={() => setRoutineDayId(day.id)}
                  style={[
                    styles.target,
                    {
                      backgroundColor: selected ? colors.chip : colors.card,
                      borderColor: selected ? colors.accent : colors.border2,
                    },
                  ]}>
                  <AppText variant="body" weight="700" tone={selected ? 'default' : 'secondary'}>
                    {routineDayDisplayName(day)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </Field>

        {/* Memo */}
        <Field label="메모">
          <Input
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="메모를 남겨보세요 (선택)"
          />
        </Field>

        {/* Recalc notice */}
        <Callout icon="info">
          기록을 수정해도 다음 운동은 자동으로 다시 계산되지 않아요. 다음 운동은 루틴 설정에서
          조정할 수 있어요.
        </Callout>

        <View style={styles.actions}>
          <Button onPress={save}>저장</Button>
          <Button
            variant="danger"
            size="md"
            onPress={() =>
              setConfirm({
                title: '이 기록을 삭제할까요?',
                description: '삭제한 기록은 되돌릴 수 없어요.',
                confirmLabel: '삭제',
                danger: true,
                onConfirm: async () => {
                  const result = await deleteRecord(id);
                  if (isActionSuccessful(result)) {
                    showToast('기록이 삭제되었어요');
                  }
                  const shouldDismiss = shouldDismissAfterAction(result);
                  if (shouldDismiss) {
                    router.replace('/records');
                  }
                  return shouldDismiss;
                },
              })
            }>
            기록 삭제
          </Button>
        </View>
      </Screen>

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      {children}
    </View>
  );
}

function StepperRow({
  value,
  onDec,
  onInc,
}: {
  value: string;
  onDec: () => void;
  onInc: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stepper, { backgroundColor: colors.card, borderColor: colors.border2 }]}>
      <IconButton icon="chevronLeft" onPress={onDec} />
      <AppText variant="item">{value}</AppText>
      <IconButton icon="chevronRight" onPress={onInc} />
    </View>
  );
}

function TimeStepper({
  caption,
  value,
  disabled,
  onHour,
  onMinute,
}: {
  caption: string;
  value: string;
  disabled?: boolean;
  onHour: (delta: number) => void;
  onMinute: (delta: number) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.timeStepper, { opacity: disabled ? 0.4 : 1 }]}>
      <AppText variant="caption" tone="muted">
        {caption}
      </AppText>
      <View
        style={[styles.timeValueBox, { backgroundColor: colors.card, borderColor: colors.border2 }]}>
        <AppText variant="item">{value}</AppText>
      </View>
      <View style={styles.timeButtons}>
        <MiniAdjust label="시" onDec={() => onHour(-1)} onInc={() => onHour(1)} disabled={disabled} />
        <MiniAdjust
          label="분"
          onDec={() => onMinute(-5)}
          onInc={() => onMinute(5)}
          disabled={disabled}
        />
      </View>
    </View>
  );
}

function MiniAdjust({
  label,
  onDec,
  onInc,
  disabled,
}: {
  label: string;
  onDec: () => void;
  onInc: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.miniAdjust}>
      <IconButton icon="minus" disabled={disabled} onPress={onDec} />
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      <IconButton icon="plus" disabled={disabled} onPress={onInc} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xs,
  },
  timeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timeStepper: {
    flex: 1,
    gap: spacing.xxs,
  },
  timeValueBox: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  timeButtons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  miniAdjust: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  durationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  targetList: {
    gap: spacing.xs,
  },
  target: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  actions: {
    gap: spacing.xs,
  },
});
