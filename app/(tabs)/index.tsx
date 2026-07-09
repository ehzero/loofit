import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { Heatmap } from '@/src/components/Heatmap';
import { Panel } from '@/src/components/Panel';
import { RoutineDayRow, SessionRow } from '@/src/components/Rows';
import { Screen } from '@/src/components/Screen';
import { formatDuration } from '@/src/domain/date';
import { joinPartNames } from '@/src/domain/routine';
import { useAppStore } from '@/src/store/app-store';
import { theme } from '@/src/styles/theme';
import type { BodyPart, RoutineTemplate } from '@/src/types';

const TEMPLATE_LABELS: Array<{ key: RoutineTemplate; label: string; description: string }> = [
  { key: 'ppl', label: 'PPL', description: 'Push / Pull / Legs' },
  { key: 'threeSplit', label: '3분할', description: '가슴+삼두 / 등+이두 / 하체+어깨' },
  { key: 'upperLower', label: '상하체', description: '상체 / 하체+코어' },
];

export default function HomeScreen() {
  const router = useRouter();
  const overview = useAppStore((state) => state.overview);
  const isReady = useAppStore((state) => state.isReady);
  const isBusy = useAppStore((state) => state.isBusy);
  const error = useAppStore((state) => state.error);
  const createTemplate = useAppStore((state) => state.createTemplate);
  const refresh = useAppStore((state) => state.refresh);
  const start = useAppStore((state) => state.start);
  const [selectedFreeParts, setSelectedFreeParts] = useState<number[]>([]);

  if (!overview) {
    return (
      <Screen title="Loofit" subtitle="내 분할 루틴을 불러오는 중" isLoading={!isReady}>
        {error ? (
          <Panel title="앱을 불러오지 못했어요">
            <Text style={styles.muted}>{error}</Text>
            <AppButton disabled={isBusy} onPress={refresh}>
              다시 시도
            </AppButton>
          </Panel>
        ) : null}
      </Screen>
    );
  }

  const recommendationTitle = overview.nextRoutineDay?.name ?? '루틴이 필요해요';
  const recommendationSubtitle = overview.nextRoutineDay
    ? joinPartNames(overview.nextRoutineDay.parts)
    : '아래 템플릿으로 첫 루틴을 만들 수 있어요.';

  const goSession = () => router.push('/session');

  async function startRoutine(routineDayId: number) {
    await start({ kind: 'routine', routineDayId });
    goSession();
  }

  async function startFreeWorkout() {
    if (selectedFreeParts.length === 0) {
      return;
    }
    await start({ kind: 'free', bodyPartIds: selectedFreeParts });
    goSession();
  }

  return (
    <Screen
      title="Loofit"
      subtitle="내 분할 루틴대로 오늘 할 운동을 바로 시작하세요."
      isLoading={!isReady}>
      {overview.activeSession ? (
        <Panel title="진행 중">
          <Text style={styles.bigText}>
            {joinPartNames(overview.activeSession.parts.map((part) => ({ name: part.bodyPartName })))}
          </Text>
          <Text style={styles.muted}>시작 {new Date(overview.activeSession.startedAt).toLocaleString()}</Text>
          <AppButton onPress={goSession}>운동 중 화면 열기</AppButton>
        </Panel>
      ) : null}

      <Panel title="오늘 추천 운동">
        <Text style={styles.recommendTitle}>{recommendationTitle}</Text>
        <Text style={styles.muted}>{recommendationSubtitle}</Text>
        {overview.nextRoutineDay ? (
          <AppButton disabled={isBusy} onPress={() => startRoutine(overview.nextRoutineDay!.id)}>
            추천 운동 시작
          </AppButton>
        ) : null}
      </Panel>

      {!overview.activeRoutine ? (
        <Panel title="첫 루틴 만들기">
          {TEMPLATE_LABELS.map((template) => (
            <Pressable
              key={template.key}
              style={styles.template}
              onPress={() => createTemplate(template.key)}>
              <View style={styles.templateText}>
                <Text style={styles.templateTitle}>{template.label}</Text>
                <Text style={styles.muted}>{template.description}</Text>
              </View>
              <Text style={styles.templateAction}>생성</Text>
            </Pressable>
          ))}
        </Panel>
      ) : (
        <Panel title="다른 루틴 운동">
          {overview.routineDays.map((day) => (
            <RoutineDayRow
              key={day.id}
              day={day}
              isNext={day.id === overview.nextRoutineDay?.id}
              onPress={() => startRoutine(day.id)}
            />
          ))}
        </Panel>
      )}

      <Panel title="루틴 밖 자유 운동">
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
          disabled={selectedFreeParts.length === 0 || isBusy}
          onPress={startFreeWorkout}>
          자유 운동 시작
        </AppButton>
      </Panel>

      <Panel title="최근 30일">
        <Heatmap days={overview.heatmap30} />
      </Panel>

      <View style={styles.stats}>
        <Panel>
          <Text style={styles.metric}>{overview.dashboard.weekWorkoutCount}</Text>
          <Text style={styles.muted}>이번 주 횟수</Text>
        </Panel>
        <Panel>
          <Text style={styles.metric}>{formatDuration(overview.dashboard.totalDurationSeconds)}</Text>
          <Text style={styles.muted}>총 운동 시간</Text>
        </Panel>
      </View>

      <Panel title="최근 기록">
        {overview.recentSessions.length === 0 ? (
          <Text style={styles.muted}>아직 운동 기록이 없습니다.</Text>
        ) : (
          overview.recentSessions.slice(0, 5).map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onPress={() => router.push(`/record/${session.id}`)}
            />
          ))
        )}
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
  bigText: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  recommendTitle: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '900',
  },
  muted: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  template: {
    alignItems: 'center',
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  templateText: {
    flex: 1,
    gap: 3,
  },
  templateTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  templateAction: {
    color: theme.colors.primary,
    fontWeight: '800',
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
  stats: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  metric: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
});
