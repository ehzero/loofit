import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/src/components/BottomSheet';
import { Button } from '@/src/components/Button';
import { Card } from '@/src/components/Card';
import { Chip } from '@/src/components/Chip';
import { ConfirmDialog, type ConfirmConfig } from '@/src/components/ConfirmDialog';
import { HeatGrid } from '@/src/components/Heat';
import { Icon } from '@/src/components/Icon';
import { PulseDot } from '@/src/components/PulseDot';
import { RecordRow } from '@/src/components/RecordRow';
import { Screen } from '@/src/components/Screen';
import { StatTiles } from '@/src/components/StatTiles';
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
    return <Screen title="루핏" isLoading={!isReady} />;
  }

  // ---- Onboarding: no routine yet ----
  if (!overview.activeRoutine) {
    return (
      <Screen>
        <View style={styles.onboardHero}>
          <View style={[styles.onboardIcon, { backgroundColor: colors.card }]}>
            <Icon name="dumbbell" size={26} color={colors.accent} />
          </View>
          <Text style={[styles.onboardTitle, { color: colors.tx }]}>아직 루틴이 없어요</Text>
          <Text style={[styles.onboardDesc, { color: colors.tx3 }]}>
            루틴을 만들면 다음에 할 운동을{'\n'}루핏이 자동으로 알려드려요.
          </Text>
        </View>
        <View style={styles.onboardList}>
          {TEMPLATES.map((template) => (
            <TemplatePick
              key={template.key}
              name={template.name}
              desc={template.desc}
              onPress={() => createTemplate(template.key).then(() => showToast(`${template.name} 루틴을 만들었어요`))}
            />
          ))}
          <TemplatePick
            name="직접 만들기"
            desc="빈 루틴에서 시작"
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
              <Text style={[styles.duringStatusText, { color: colors.accent }]}>운동 중</Text>
            </View>
            <Text style={[styles.duringPart, { color: colors.tx }]}>{partStr}</Text>
            <Text style={[styles.duringTimer, { color: colors.tx }]}>
              {formatElapsed(elapsedSeconds)}
            </Text>
            <Text style={[styles.duringStart, { color: colors.tx4 }]}>
              시작 {formatClock(active.startedAt)}
            </Text>
            <Pressable
              onPress={() => setSheet('change')}
              style={[styles.changeBtn, { backgroundColor: colors.surface2, borderColor: colors.border2 }]}>
              <Text style={[styles.changeBtnText, { color: colors.tx2 }]}>운동 변경</Text>
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
          <Text style={[styles.greetDate, { color: colors.tx4 }]}>{formatDateFull(new Date())}</Text>
          <Text style={[styles.greet, { color: colors.tx }]}>{greeting}</Text>
        </View>

        {isPost ? (
          <Card style={styles.heroCard} padding={22} gap={16}>
            <View style={styles.postHead}>
              <View style={[styles.postCheck, { backgroundColor: colors.accent }]}>
                <Icon name="check" size={18} color={colors.accentText} weight="bold" />
              </View>
              <Text style={[styles.postTitle, { color: colors.tx }]}>오늘 운동 완료</Text>
            </View>
            <Text style={[styles.postParts, { color: colors.tx }]}>
              {todayParts.join(' · ')}
            </Text>
            <View style={styles.postStats}>
              <View style={styles.postStat}>
                <Text style={[styles.postStatLabel, { color: colors.tx4 }]}>운동 시간</Text>
                <Text style={[styles.postStatValue, { color: colors.accent }]}>
                  {formatDuration(todayDuration)}
                </Text>
              </View>
              <View style={styles.postStat}>
                <Text style={[styles.postStatLabel, { color: colors.tx4 }]}>시간대</Text>
                <Text style={[styles.postRange, { color: colors.tx2 }]}>{todayRange}</Text>
              </View>
            </View>
            {nextDay ? (
              <View style={[styles.postNext, { borderTopColor: colors.border }]}>
                <Text style={[styles.postNextLabel, { color: colors.tx4 }]}>다음 운동</Text>
                <Text style={[styles.postNextName, { color: colors.tx }]}>
                  {routineDayDisplayName(nextDay)}
                </Text>
              </View>
            ) : null}
          </Card>
        ) : (
          <Card style={styles.heroCard} padding={22} gap={16}>
            <View style={styles.nextHead}>
              <View style={[styles.dot, { backgroundColor: colors.accent }]} />
              <Text style={[styles.nextLabel, { color: colors.tx3 }]}>다음 운동</Text>
            </View>
            <Text style={[styles.nextName, { color: colors.tx }]}>
              {nextDay ? routineDayDisplayName(nextDay) : '루틴을 설정하세요'}
            </Text>
            {nextDay && hasRoutineDayAlias(nextDay) ? (
              <Text style={[styles.nextParts, { color: colors.tx3 }]}>
                {nextDay.parts.map((part) => part.name).join(' · ')}
              </Text>
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
                  style={[styles.emptyPartsNotice, { backgroundColor: colors.surface2, borderColor: colors.border2 }]}>
                  <Text style={[styles.emptyPartsText, { color: colors.tx3 }]}>
                    이 분할에 운동 부위가 없어요. 루틴 설정에서 추가해 주세요 →
                  </Text>
                </Pressable>
              )
            ) : null}
            <Pressable onPress={() => setSheet('start')} style={styles.selectOther}>
              <Text style={[styles.selectOtherText, { color: colors.tx3 }]}>다른 운동 선택 →</Text>
            </Pressable>
          </Card>
        )}

        <StatTiles
          tiles={[
            { label: '이번 주', value: weekCountStr },
            { label: '총 운동 시간', value: totalStr },
          ]}
        />

        <Card title="최근 7일" action={<SeeMore label="더보기" onPress={() => router.push('/dashboard')} />}>
          <HeatGrid cells={overview.heatmap7} weekdayLabels />
        </Card>

        <View style={styles.recentBlock}>
          <View style={styles.recentHead}>
            <Text style={[styles.recentTitle, { color: colors.tx }]}>최근 기록</Text>
            <SeeMore label="전체보기" onPress={() => router.push('/records')} />
          </View>
          {overview.recentSessions.length === 0 ? (
            <Card>
              <Text style={[styles.empty, { color: colors.tx4 }]}>아직 운동 기록이 없어요.</Text>
            </Card>
          ) : (
            overview.recentSessions.slice(0, 3).map((session) => (
              <RecordRow
                key={session.id}
                session={session}
                compact
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

function TemplatePick({ name, desc, onPress }: { name: string; desc: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.templatePick, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.templateText}>
        <Text style={[styles.templateName, { color: colors.tx }]}>{name}</Text>
        <Text style={[styles.templateDesc, { color: colors.tx4 }]}>{desc}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={colors.tx5} />
    </Pressable>
  );
}

function SeeMore({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={[styles.seeMore, { color: colors.tx3 }]}>{label}</Text>
    </Pressable>
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
  const { colors } = useTheme();
  return (
    <BottomSheet visible={visible} title="운동 선택" onClose={onClose}>
      <View style={styles.sheetSection}>
        <Text style={[styles.sheetLabel, { color: colors.tx4 }]}>루틴 운동</Text>
        {overview.routineDays.map((day) => {
          const startable = day.parts.length > 0;
          const sub = !startable
            ? '부위 없음 — 루틴 설정에서 추가'
            : hasRoutineDayAlias(day)
              ? day.parts.map((part) => part.name).join(' · ')
              : null;
          return (
            <Pressable
              key={day.id}
              disabled={!startable}
              onPress={() => onStartRoutine(day.id)}
              style={[
                styles.sheetRow,
                {
                  backgroundColor: colors.surface2,
                  borderColor: colors.border2,
                  opacity: startable ? 1 : 0.45,
                },
              ]}>
              <View style={styles.sheetRowText}>
                <Text style={[styles.sheetRowTitle, { color: colors.tx }]}>
                  {routineDayDisplayName(day)}
                </Text>
                {sub ? (
                  <Text style={[styles.sheetRowSub, { color: colors.tx4 }]}>{sub}</Text>
                ) : null}
              </View>
              {startable && day.id === overview.nextRoutineDay?.id ? (
                <View style={[styles.nextBadge, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.nextBadgeText, { color: colors.accentText }]}>다음</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.sheetSection}>
        <Text style={[styles.sheetLabel, { color: colors.tx4 }]}>루틴 밖 자유 운동</Text>
        <View style={styles.tagRow}>
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
      <View style={styles.tagRow}>
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
    gap: 10,
    paddingTop: 24,
    paddingBottom: 20,
  },
  onboardIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  onboardTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  onboardDesc: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  onboardList: {
    gap: 10,
  },
  templatePick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
  },
  templateText: {
    gap: 4,
  },
  templateName: {
    fontSize: 16,
    fontWeight: '800',
  },
  templateDesc: {
    fontSize: 13,
    fontWeight: '500',
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
    gap: 9,
    marginBottom: 14,
  },
  duringStatusText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  duringPart: {
    fontSize: 22,
    fontWeight: '800',
  },
  duringTimer: {
    fontSize: 74,
    fontWeight: '800',
    letterSpacing: -2,
    marginVertical: 6,
    fontVariant: ['tabular-nums'],
  },
  duringStart: {
    fontSize: 13,
    fontWeight: '600',
  },
  changeBtn: {
    marginTop: 22,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  changeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  duringActions: {
    gap: 6,
  },
  // feed
  greetBlock: {
    gap: 3,
  },
  greetDate: {
    fontSize: 13,
    fontWeight: '600',
  },
  greet: {
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  heroCard: {
    borderRadius: 24,
  },
  nextHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  nextLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  nextName: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 44,
  },
  nextParts: {
    fontSize: 14,
    fontWeight: '600',
  },
  postParts: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  emptyPartsNotice: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 15,
  },
  emptyPartsText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  selectOther: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  selectOtherText: {
    fontSize: 14,
    fontWeight: '700',
  },
  postHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  postCheck: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  postStats: {
    flexDirection: 'row',
    gap: 28,
  },
  postStat: {
    gap: 5,
  },
  postStatLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  postStatValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  postRange: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 5,
  },
  postNext: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  postNextLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  postNextName: {
    fontSize: 15,
    fontWeight: '800',
  },
  recentBlock: {
    gap: 12,
  },
  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  seeMore: {
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    fontSize: 14,
    fontWeight: '600',
  },
  // sheets
  sheetSection: {
    gap: 9,
  },
  sheetLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 15,
    paddingHorizontal: 16,
  },
  sheetRowText: {
    gap: 4,
    flex: 1,
  },
  sheetRowTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  sheetRowSub: {
    fontSize: 12,
    fontWeight: '600',
  },
  nextBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  nextBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
});
