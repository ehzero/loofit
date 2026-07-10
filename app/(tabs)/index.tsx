import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/AppText';
import { Badge } from '@/src/components/Badge';
import { BottomSheet } from '@/src/components/BottomSheet';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { Chip } from '@/src/components/Chip';
import { ConfirmDialog, type ConfirmConfig } from '@/src/components/ConfirmDialog';
import { EmptyState } from '@/src/components/EmptyState';
import { HeatGrid } from '@/src/components/Heat';
import { Icon } from '@/src/components/Icon';
import { ListRow } from '@/src/components/ListRow';
import { PulseDot } from '@/src/components/PulseDot';
import { RecordRow } from '@/src/components/RecordRow';
import { Screen } from '@/src/components/Screen';
import { SectionHeader } from '@/src/components/SectionHeader';
import { StatTiles } from '@/src/components/StatTiles';
import { BRAND } from '@/src/config/brand';
import {
  formatClock,
  formatDateFull,
  formatDuration,
  formatElapsed,
} from '@/src/domain/date';
import { getHomeMessage } from '@/src/domain/home-messages';
import { hasRoutineDayAlias, joinPartNames, routineDayDisplayName } from '@/src/domain/routine';
import { useAppStore } from '@/src/store/app-store';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/theme/ToastProvider';
import { radius, spacing } from '@/src/theme/tokens';
import type { RoutineTemplate } from '@/src/types';

const TEMPLATES: Array<{ key: RoutineTemplate; name: string; desc: string }> = [
  { key: 'threeSplit', name: '3분할', desc: '가슴·삼두 / 등·이두 / 하체·어깨' },
  { key: 'fourSplit', name: '4분할', desc: '가슴·삼두 / 등·이두 / 어깨 / 하체' },
  { key: 'upperLower', name: '2분할', desc: '상체 / 하체+코어' },
  { key: 'ppl', name: 'PPL', desc: 'Push · Pull · Legs' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { showToast } = useToast();

  const overview = useAppStore((state) => state.overview);
  const isReady = useAppStore((state) => state.isReady);
  const isBusy = useAppStore((state) => state.isBusy);
  const createTemplate = useAppStore((state) => state.createTemplate);
  const createCustom = useAppStore((state) => state.createCustom);
  const start = useAppStore((state) => state.start);
  const completeActive = useAppStore((state) => state.completeActive);
  const cancelActive = useAppStore((state) => state.cancelActive);
  const changeActive = useAppStore((state) => state.changeActive);

  const [sheet, setSheet] = useState<'start' | 'change' | null>(null);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);
  const [now, setNow] = useState(Date.now());
  const [messageSeed] = useState(() => Math.random().toString(36).slice(2));

  const active = overview?.activeSession ?? null;

  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  const elapsedSeconds = useMemo(() => {
    if (!active) {
      return 0;
    }
    return Math.max(0, Math.floor((now - new Date(active.startedAt).getTime()) / 1000));
  }, [active, now]);

  if (!overview) {
    return <Screen title={BRAND.displayName} isLoading={!isReady} />;
  }

  // ---- Onboarding: no routine yet ----
  if (!overview.activeRoutine) {
    return (
      <Screen>
        <View style={styles.onboardHero}>
          <View style={[styles.onboardIcon, { backgroundColor: colors.card }]}>
            <Icon name="dumbbell" size={26} color={colors.accent} />
          </View>
          <AppText variant="display">아직 루틴이 없어요</AppText>
          <AppText variant="item" weight="500" tone="tertiary" style={styles.onboardDesc}>
            루틴을 만들면 다음에 할 운동을{'\n'}{BRAND.displayName}이 자동으로 알려드려요.
          </AppText>
        </View>
        <View style={styles.onboardList}>
          {TEMPLATES.map((template) => (
            <ListRow
              key={template.key}
              variant="card"
              surface="card"
              chevron
              title={template.name}
              subtitle={template.desc}
              onPress={() =>
                createTemplate(template.key).then(() =>
                  showToast(`${template.name} 루틴을 만들었어요`)
                )
              }
            />
          ))}
          <ListRow
            variant="card"
            surface="card"
            chevron
            title="직접 만들기"
            subtitle="빈 루틴에서 시작"
            onPress={() => createCustom().then(() => router.push('/routine'))}
          />
        </View>
      </Screen>
    );
  }

  const nextDay = overview.nextRoutineDay;
  const weekCountStr = `${overview.dashboard.weekWorkoutCount}회`;
  const totalStr = formatDuration(overview.dashboard.totalDurationSeconds);

  // ---- During: an active session turns Home into the workout screen ----
  if (active) {
    const partStr = joinPartNames(active.parts.map((part) => ({ name: part.bodyPartName })));

    async function finish() {
      await completeActive();
      showToast('운동이 기록되었어요');
    }

    return (
      <>
        <Screen scroll={false}>
          <View style={styles.duringWrap}>
            <View style={styles.duringStatus}>
              <PulseDot color={colors.accent} />
              <AppText variant="footnote" weight="800" tone="accent" style={styles.duringStatusText}>
                운동 중
              </AppText>
            </View>
            <AppText variant="heading">{partStr}</AppText>
            <AppText variant="timer" style={styles.duringTimer}>
              {formatElapsed(elapsedSeconds)}
            </AppText>
            <AppText variant="footnote" tone="muted">
              시작 {formatClock(active.startedAt)}
            </AppText>
            <Pressable
              onPress={() => setSheet('change')}
              style={[
                styles.changeBtn,
                { backgroundColor: colors.surface2, borderColor: colors.border2 },
              ]}>
              <AppText variant="footnote" weight="700" tone="secondary">
                운동 변경
              </AppText>
            </Pressable>
          </View>
          <View style={styles.duringActions}>
            <Button onPress={finish}>운동 종료</Button>
            <Button
              variant="danger"
              size="md"
              onPress={() =>
                setConfirm({
                  title: '운동을 취소할까요?',
                  description:
                    '취소한 운동은 기록에는 남지만 다음 운동 계산에는 반영되지 않아요.',
                  confirmLabel: '운동 취소',
                  danger: true,
                  onConfirm: () => cancelActive().then(() => showToast('운동이 취소되었어요')),
                })
              }>
              운동 취소
            </Button>
          </View>
        </Screen>

        <ChangePartSheet
          visible={sheet === 'change'}
          bodyParts={overview.bodyParts.map((part) => ({ id: part.id, name: part.name }))}
          activeIds={active.parts.map((part) => part.bodyPartId).filter((id): id is number => !!id)}
          onClose={() => setSheet(null)}
          onPick={(id) => {
            changeActive({ kind: 'free', bodyPartIds: [id] });
            setSheet(null);
          }}
        />
        <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
      </>
    );
  }

  // ---- Feed: pre / post ----
  const todaySessions = overview.todaySessions;
  const isPost = todaySessions.length > 0;
  const todayParts = [
    ...new Set(todaySessions.flatMap((session) => session.parts.map((part) => part.bodyPartName))),
  ];
  const todayDuration = todaySessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const ordered = [...todaySessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );
  const todayRange =
    ordered.length > 0
      ? `${formatClock(ordered[0].startedAt)} – ${formatClock(ordered[ordered.length - 1].endedAt ?? ordered[ordered.length - 1].startedAt)}`
      : '';

  const messagePartNames = isPost
    ? todayParts
    : nextDay?.parts.map((part) => part.name) ?? [];
  const messagePartKey = messagePartNames.join('|');
  const greeting = getHomeMessage({
    phase: isPost ? 'after' : 'before',
    partNames: messagePartNames,
    seed: `${messageSeed}:${messagePartKey}:${overview.latestCompletedToday?.id ?? 'none'}`,
  });

  return (
    <>
      <Screen>
        <View style={styles.greetBlock}>
          <AppText variant="footnote" tone="muted">
            {formatDateFull(new Date())}
          </AppText>
          <AppText variant="heading">{greeting}</AppText>
        </View>

        {isPost ? (
          <Card variant="hero">
            <View style={styles.postHead}>
              <View style={[styles.postCheck, { backgroundColor: colors.accent }]}>
                <Icon name="check" size={18} color={colors.accentText} weight="bold" />
              </View>
              <AppText variant="title">오늘 운동 완료</AppText>
            </View>
            <AppText variant="heading">{todayParts.join(' · ')}</AppText>
            <View style={styles.postStats}>
              <View style={styles.postStat}>
                <AppText variant="label" tone="muted">
                  운동 시간
                </AppText>
                <AppText variant="heading" tone="accent">
                  {formatDuration(todayDuration)}
                </AppText>
              </View>
              <View style={styles.postStat}>
                <AppText variant="label" tone="muted">
                  시간대
                </AppText>
                <AppText variant="body" weight="700" tone="secondary" style={styles.postRange}>
                  {todayRange}
                </AppText>
              </View>
            </View>
            {nextDay ? (
              <View style={[styles.postNext, { borderTopColor: colors.border }]}>
                <AppText variant="footnote" weight="700" tone="muted">
                  다음 운동
                </AppText>
                <AppText variant="item" weight="800">
                  {routineDayDisplayName(nextDay)}
                </AppText>
              </View>
            ) : null}
          </Card>
        ) : (
          <Card variant="hero">
            <View style={styles.nextHead}>
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              <AppText variant="label" tone="tertiary" style={styles.nextLabel}>
                다음 운동
              </AppText>
            </View>
            <AppText variant="hero">
              {nextDay ? routineDayDisplayName(nextDay) : '루틴을 설정하세요'}
            </AppText>
            {nextDay && hasRoutineDayAlias(nextDay) ? (
              <AppText variant="body" tone="tertiary">
                {nextDay.parts.map((part) => part.name).join(' · ')}
              </AppText>
            ) : null}
            {nextDay ? (
              nextDay.parts.length > 0 ? (
                <Button
                  disabled={isBusy}
                  onPress={() => start({ kind: 'routine', routineDayId: nextDay.id })}>
                  운동 시작
                </Button>
              ) : (
                <Pressable
                  onPress={() => router.push('/routine')}
                  style={[
                    styles.emptyPartsNotice,
                    { backgroundColor: colors.surface2, borderColor: colors.border2 },
                  ]}>
                  <AppText variant="footnote" tone="tertiary">
                    이 분할에 운동 부위가 없어요. 루틴 설정에서 추가해 주세요 →
                  </AppText>
                </Pressable>
              )
            ) : null}
            <Pressable onPress={() => setSheet('start')} style={styles.selectOther}>
              <AppText variant="body" weight="700" tone="tertiary">
                다른 운동 선택 →
              </AppText>
            </Pressable>
          </Card>
        )}

        <StatTiles
          tiles={[
            { label: '이번 주', value: weekCountStr },
            { label: '총 운동 시간', value: totalStr },
          ]}
        />

        <Card
          title="최근 7일"
          action={
            <Pressable onPress={() => router.push('/dashboard')} hitSlop={8}>
              <AppText variant="label" tone="tertiary">
                더보기
              </AppText>
            </Pressable>
          }>
          <HeatGrid cells={overview.heatmap7} weekdayLabels />
        </Card>

        <View style={styles.recentBlock}>
          <SectionHeader
            title="최근 기록"
            actionLabel="전체보기"
            onAction={() => router.push('/records')}
          />
          {overview.recentSessions.length === 0 ? (
            <Card>
              <EmptyState compact title="아직 운동 기록이 없어요." />
            </Card>
          ) : (
            overview.recentSessions.slice(0, 3).map((session) => (
              <RecordRow
                key={session.id}
                session={session}
                onPress={() => router.push(`/record/${session.id}`)}
              />
            ))
          )}
        </View>
      </Screen>

      <StartSheet
        visible={sheet === 'start'}
        overview={overview}
        onClose={() => setSheet(null)}
        onStartRoutine={(routineDayId) => {
          start({ kind: 'routine', routineDayId });
          setSheet(null);
        }}
        onStartFree={(bodyPartId) => {
          start({ kind: 'free', bodyPartIds: [bodyPartId] });
          setSheet(null);
        }}
      />
    </>
  );
}

function StartSheet({
  visible,
  overview,
  onClose,
  onStartRoutine,
  onStartFree,
}: {
  visible: boolean;
  overview: NonNullable<ReturnType<typeof useAppStore.getState>['overview']>;
  onClose: () => void;
  onStartRoutine: (routineDayId: number) => void;
  onStartFree: (bodyPartId: number) => void;
}) {
  return (
    <BottomSheet visible={visible} title="운동 선택" onClose={onClose}>
      <View style={styles.sheetSection}>
        <AppText variant="label" tone="muted">
          루틴 운동
        </AppText>
        {overview.routineDays.map((day) => {
          const startable = day.parts.length > 0;
          const sub = !startable
            ? '부위 없음 — 루틴 설정에서 추가'
            : hasRoutineDayAlias(day)
              ? day.parts.map((part) => part.name).join(' · ')
              : undefined;
          return (
            <ListRow
              key={day.id}
              variant="card"
              title={routineDayDisplayName(day)}
              subtitle={sub}
              disabled={!startable}
              onPress={() => onStartRoutine(day.id)}
              right={
                startable && day.id === overview.nextRoutineDay?.id ? (
                  <Badge variant="accent" label="다음" />
                ) : undefined
              }
            />
          );
        })}
      </View>
      <View style={styles.sheetSection}>
        <AppText variant="label" tone="muted">
          루틴 밖 자유 운동
        </AppText>
        <View style={styles.chipWrap}>
          {overview.bodyParts.map((part) => (
            <Chip key={part.id} label={part.name} onPress={() => onStartFree(part.id)} />
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

function ChangePartSheet({
  visible,
  bodyParts,
  activeIds,
  onClose,
  onPick,
}: {
  visible: boolean;
  bodyParts: Array<{ id: number; name: string }>;
  activeIds: number[];
  onClose: () => void;
  onPick: (id: number) => void;
}) {
  return (
    <BottomSheet visible={visible} title="운동 부위 변경" onClose={onClose}>
      <View style={styles.chipWrap}>
        {bodyParts.map((part) => (
          <Chip
            key={part.id}
            label={part.name}
            selected={activeIds.includes(part.id)}
            onPress={() => onPick(part.id)}
          />
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // onboarding
  onboardHero: {
    gap: spacing.xs,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  onboardIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  onboardDesc: {
    lineHeight: 22,
  },
  onboardList: {
    gap: spacing.xs,
  },
  // during
  duringWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  duringStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  duringStatusText: {
    letterSpacing: 1.4,
  },
  duringTimer: {
    marginVertical: spacing.xxs,
  },
  changeBtn: {
    marginTop: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  duringActions: {
    gap: spacing.xxs,
  },
  // feed
  greetBlock: {
    gap: spacing.xxs,
  },
  nextHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.xs,
  },
  nextLabel: {
    letterSpacing: 0.8,
  },
  emptyPartsNotice: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  selectOther: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  postHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  postCheck: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postStats: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  postStat: {
    gap: spacing.xxs,
  },
  postRange: {
    marginTop: spacing.xxs,
  },
  postNext: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentBlock: {
    gap: spacing.sm,
  },
  // sheets
  sheetSection: {
    gap: spacing.xs,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
