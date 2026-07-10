import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PulseDot } from '@/src/components/PulseDot';
import { Screen } from '@/src/components/Screen';
import { formatClock, formatDuration, formatElapsed } from '@/src/domain/date';
import { joinPartNames, routineDayDisplayName } from '@/src/domain/routine';
import { useAppStore } from '@/src/store/app-store';
import { useTheme } from '@/src/theme/ThemeProvider';
import { makeColors, radius, spacing } from '@/src/theme/tokens';
import { buildHeatmapWidgetProps } from '@/src/widgets/heatmap-widget-model';
import { HeatmapWidgetPreview } from '@/src/widgets/preview/HeatmapWidgetPreview';
import { WIDGET_PREVIEW_SPEC } from '@/src/widgets/widget-spec';

// The design renders these widgets on a fixed dark home-screen preview
// regardless of the in-app theme, so we build a dark palette explicitly.
// Heatmap widgets use WIDGET_PREVIEW_SPEC as their source of truth; the iOS
// widget renderer receives the same values through snapshot props.
const WIDGET_BG = WIDGET_PREVIEW_SPEC.screenBackground;
const CARD_BG = WIDGET_PREVIEW_SPEC.card.background;
const CARD_BORDER = WIDGET_PREVIEW_SPEC.card.border;

export default function WidgetsScreen() {
  const router = useRouter();
  const { accent } = useTheme();
  const overview = useAppStore((state) => state.overview);
  const dark = useMemo(() => makeColors('dark', accent), [accent]);

  const next = overview?.nextRoutineDay;
  const active = overview?.activeSession ?? null;
  const today = overview?.todaySessions ?? [];

  const duringPart = active
    ? joinPartNames(active.parts.map((part) => ({ name: part.bodyPartName })))
    : '가슴 · 어깨';
  const duringElapsed = active
    ? formatElapsed(Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000))
    : '42:10';

  const todayParts = [
    ...new Set(today.flatMap((session) => session.parts.map((part) => part.bodyPartName))),
  ];
  const todayDuration = today.reduce((sum, session) => sum + session.durationSeconds, 0);
  const postParts = todayParts.length ? todayParts.join(' · ') : '등 · 이두';
  const postDuration = today.length ? formatDuration(todayDuration) : '1시간 5분';
  const orderedToday = [...today].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );
  const postRange = orderedToday.length
    ? `${formatClock(orderedToday[0].startedAt)} – ${formatClock(
        orderedToday[orderedToday.length - 1].endedAt ??
          orderedToday[orderedToday.length - 1].startedAt
      )}`
    : '오후 7:24 – 오후 8:29';
  const weekWidget = overview
    ? buildHeatmapWidgetProps({ variant: 'week', cells: overview.heatmap7, colors: dark })
    : null;
  const monthWidget = overview
    ? buildHeatmapWidgetProps({ variant: 'month', cells: overview.heatmapGrid, colors: dark })
    : null;
  const yearWidget = overview
    ? buildHeatmapWidgetProps({ variant: 'year', cells: overview.heatmapYear, colors: dark })
    : null;

  return (
    <Screen title="위젯 미리보기" onBack={() => router.back()} background={WIDGET_BG}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>운동 시작 / 종료 위젯</Text>

        <Text style={styles.sizeLabel}>Small</Text>
        <View style={styles.smallRow}>
          {/* PRE */}
          <View style={[styles.widgetCard, styles.smallSquare]}>
            <View style={styles.rowBetween}>
              <Text style={styles.tinyLabel}>다음 운동</Text>
              <Text style={styles.brand}>LOOFIT</Text>
            </View>
            <Text style={styles.smallName} numberOfLines={2}>
              {next ? routineDayDisplayName(next) : 'Pull'}
            </Text>
            <View style={styles.smallSpacer} />
            <CtaPill label="운동 시작" bg={accent} fg={dark.accentText} />
          </View>

          {/* DURING */}
          <View style={[styles.widgetCard, styles.smallSquare]}>
            <View style={styles.rowBetween}>
              <View style={styles.duringHead}>
                <PulseDot color={accent} size={7} />
                <Text style={[styles.tinyLabel, { color: accent }]}>운동 중</Text>
              </View>
              <Text style={styles.brand}>LOOFIT</Text>
            </View>
            <View style={styles.timerBlock}>
              <Text style={styles.smallTimer}>{duringElapsed}</Text>
              <Text style={styles.partsStr} numberOfLines={1}>
                {duringPart}
              </Text>
            </View>
            <View style={styles.smallSpacer} />
            <CtaPill label="운동 종료" bg="#26262B" fg="#F4F4F2" />
          </View>

          {/* POST */}
          <View style={[styles.widgetCard, styles.smallSquare]}>
            <View style={styles.rowBetween}>
              <Text style={styles.tinyLabel}>오늘 운동 완료</Text>
              <Text style={styles.brand}>LOOFIT</Text>
            </View>
            <Text style={styles.smallName} numberOfLines={2}>
              {postParts}
            </Text>
            <View style={styles.smallSpacer} />
            <Text style={[styles.smallDur, { color: accent }]}>{postDuration}</Text>
            <Text style={styles.smallRange} numberOfLines={1}>
              {postRange}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>히트맵 캘린더 위젯</Text>

        <Text style={styles.sizeLabel}>Small</Text>
        <View style={styles.smallRow}>
          {weekWidget ? (
            <HeatmapWidgetPreview
              title="최근 7일"
              variant="week"
              widget={weekWidget}
              style={styles.smallSquare}
            />
          ) : null}
          {monthWidget ? (
            <HeatmapWidgetPreview
              title="최근 30일"
              variant="month"
              widget={monthWidget}
              style={styles.smallSquare}
            />
          ) : null}
        </View>

        <Text style={styles.sizeLabel}>Medium</Text>
        {yearWidget ? (
          <HeatmapWidgetPreview
            title="최근 1년"
            variant="year"
            widget={yearWidget}
            style={styles.mediumRect}
          />
        ) : null}
      </View>
    </Screen>
  );
}

/** The one small-widget CTA pill — PRE/DURING must share identical geometry. */
function CtaPill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.widgetCtaSm, { backgroundColor: bg }]}>
      <Text style={[styles.widgetCtaSmText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: '#9A9A9F',
    letterSpacing: 0.5,
  },
  sizeLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: '#6B6B70',
    marginTop: 2,
  },
  smallRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // stretch (기본값) would override the children's aspect-ratio height when
    // two cards share a row, squashing the squares.
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  smallSquare: {
    width: '47%',
    aspectRatio: 1,
  },
  smallName: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
    color: '#F4F4F2',
    letterSpacing: -0.4,
  },
  smallTimer: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800',
    color: '#F4F4F2',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  smallSpacer: {
    flex: 1,
  },
  // 타이머와 부위는 한 묶음 — 카드 gap(12)이 두 번 걸려 정사각을 넘치는 것 방지
  timerBlock: {
    gap: 4,
  },
  smallRange: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: '#8A8A90',
  },
  // iOS systemMedium proportions (~364x170pt). Content spreads vertically so
  // cards with less content keep the same footprint.
  mediumRect: {
    aspectRatio: 2.14,
    justifyContent: 'space-between',
  },
  widgetCtaSm: {
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  widgetCtaSmText: {
    fontSize: 13,
    fontWeight: '800',
    // 명시적 lineHeight — 글리프 구성에 따른 높이 드리프트 방지 (실위젯 CTA와 동일 높이)
    lineHeight: 18,
  },
  widgetCard: {
    backgroundColor: CARD_BG,
    borderColor: CARD_BORDER,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tinyLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    color: '#8A8A90',
    letterSpacing: 0.6,
  },
  brand: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: '#6B6B70',
  },
  partsStr: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#8A8A90',
  },
  duringHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  smallDur: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
  },
});
