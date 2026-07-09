import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { HeatGrid } from '@/src/components/Heat';
import { PulseDot } from '@/src/components/PulseDot';
import { Screen } from '@/src/components/Screen';
import { formatClock, formatDuration, formatElapsed } from '@/src/domain/date';
import { joinPartNames, routineDayDisplayName } from '@/src/domain/routine';
import { useAppStore } from '@/src/store/app-store';
import { useTheme } from '@/src/theme/ThemeProvider';
import { heatColor, makeColors, radius, spacing, type ThemeColors } from '@/src/theme/tokens';
import type { HeatmapGridCell } from '@/src/types';

// The design renders these widgets on a fixed dark home-screen preview
// regardless of the in-app theme, so we build a dark palette explicitly.
// Text sizes/colors here are widget-surface constants that must stay in sync
// with the real widget views (src/widgets/*), which cannot import tokens due
// to the 'widget' directive's isolated JS context — they are exempt from the
// app-wide token rule. Structural spacing/radius still uses tokens.
const WIDGET_BG = '#0C0D10';
const CARD_BG = 'rgba(20,20,24,0.72)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';

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
            <View style={[styles.widgetCtaSm, { backgroundColor: accent }]}>
              <Text style={[styles.widgetCtaSmText, { color: dark.accentText }]}>운동 시작</Text>
            </View>
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
            <Text style={styles.smallTimer}>{duringElapsed}</Text>
            <Text style={styles.partsStr} numberOfLines={1}>
              {duringPart}
            </Text>
            <View style={styles.smallSpacer} />
            <View style={[styles.widgetCtaSm, { backgroundColor: '#26262B' }]}>
              <Text style={[styles.widgetCtaSmText, { color: '#F4F4F2' }]}>운동 종료</Text>
            </View>
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
          <View style={[styles.widgetCard, styles.smallSquare]}>
            <View style={styles.rowBetween}>
              <Text style={styles.tinyLabel}>최근 7일</Text>
              <Text style={styles.brand}>LOOFIT</Text>
            </View>
            {overview ? (
              <HeatGrid cells={overview.heatmap7} colorsOverride={dark} gap={4} radius={4} />
            ) : null}
          </View>
          <View style={[styles.widgetCard, styles.smallSquare]}>
            <View style={styles.rowBetween}>
              <Text style={styles.tinyLabel}>최근 30일</Text>
              <Text style={styles.brand}>LOOFIT</Text>
            </View>
            {overview ? (
              <HeatGrid cells={overview.heatmapGrid} colorsOverride={dark} gap={3} radius={3} />
            ) : null}
          </View>
        </View>

        <Text style={styles.sizeLabel}>Medium</Text>
        <View style={[styles.widgetCard, styles.mediumRect]}>
          <View style={styles.rowBetween}>
            <Text style={styles.tinyLabel}>최근 1년</Text>
            <Text style={styles.brand}>LOOFIT</Text>
          </View>
          {overview ? <YearMiniGrid cells={overview.heatmapYear} colors={dark} /> : null}
        </View>
      </View>
    </Screen>
  );
}

/** Compressed GitHub-style year grid mirroring HeatmapYearWidget's layout. */
function YearMiniGrid({ cells, colors }: { cells: HeatmapGridCell[]; colors: ThemeColors }) {
  const weekCount = Math.ceil(cells.length / 7);
  return (
    <View style={styles.yearMini}>
      {Array.from({ length: 7 }, (_, weekday) => (
        <View key={weekday} style={styles.yearMiniRow}>
          {Array.from({ length: weekCount }, (_, week) => {
            const cell = cells[week * 7 + weekday];
            return (
              <View
                key={week}
                style={[
                  styles.yearMiniCell,
                  {
                    backgroundColor: cell
                      ? heatColor(colors, cell.bucket, cell.inRange)
                      : 'transparent',
                  },
                ]}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9A9A9F',
    letterSpacing: 0.5,
  },
  sizeLabel: {
    fontSize: 11,
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
    fontWeight: '800',
    color: '#F4F4F2',
    letterSpacing: -0.4,
  },
  smallTimer: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F4F4F2',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  smallSpacer: {
    flex: 1,
  },
  smallRange: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8A8A90',
  },
  // iOS systemMedium proportions (~364x170pt). Content spreads vertically so
  // cards with less content keep the same footprint.
  mediumRect: {
    aspectRatio: 2.14,
    justifyContent: 'space-between',
  },
  yearMini: {
    flex: 1,
    justifyContent: 'center',
    gap: 1.5,
  },
  yearMiniRow: {
    flexDirection: 'row',
    gap: 1.5,
  },
  yearMiniCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 1,
  },
  widgetCtaSm: {
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  widgetCtaSmText: {
    fontSize: 13,
    fontWeight: '800',
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
    fontWeight: '800',
    color: '#8A8A90',
    letterSpacing: 0.6,
  },
  brand: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B6B70',
  },
  partsStr: {
    fontSize: 13,
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
    fontWeight: '800',
  },
});
