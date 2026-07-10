import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/src/components/AppText';
import { BottomSheet } from '@/src/components/BottomSheet';
import { Callout } from '@/src/components/Callout';
import { PulseDot } from '@/src/components/PulseDot';
import { Screen } from '@/src/components/Screen';
import { BRAND } from '@/src/config/brand';
import { addLocalDays, formatDuration, startOfLocalDay, toLocalDateKey } from '@/src/domain/date';
import { useTheme } from '@/src/theme/ThemeProvider';
import { spacing, type ThemeColors } from '@/src/theme/tokens';
import type { HeatmapBucket, HeatmapDay, HeatmapGridCell, RangeStats } from '@/src/types';
import {
  buildHeatmapWidgetProps,
  formatHeatmapWidgetTitle,
  formatSixMonthHeatmapWidgetTitle,
  type HeatmapWidgetFooterProps,
} from '@/src/widgets/heatmap-widget-model';
import { HeatmapWidgetPreview } from '@/src/widgets/preview/HeatmapWidgetPreview';
import { WIDGET_PREVIEW_SPEC } from '@/src/widgets/widget-spec';
import type { HeatmapWidgetProps } from '@/src/widgets/types';

const CONTROL = WIDGET_PREVIEW_SPEC.control;

type WidgetPreviewTheme = {
  cardBackground: string;
  cardBorder: string;
  labelColor: string;
  brandColor: string;
  titleColor: string;
  detailColor: string;
  neutralButtonBackground: string;
  neutralButtonText: string;
  typeLabelColor: string;
};

export default function WidgetsScreen() {
  const router = useRouter();
  const { accent, colors } = useTheme();
  const [guideVisible, setGuideVisible] = useState(false);
  const previewTheme = useMemo(() => buildWidgetPreviewTheme(colors), [colors]);
  const { weekWidget, monthWidget, yearWidget } = useMemo(
    () => buildPreviewHeatmapWidgets(colors),
    [colors]
  );

  return (
    <Screen title="위젯 미리보기" onBack={() => router.back()}>
      <Callout icon="info">
        위젯은 휴대폰 홈 화면에 추가해서 사용해요. 미리보기는 예시 데이터로 표시돼요.{' '}
        <Text
          accessibilityRole="button"
          onPress={() => setGuideVisible(true)}
          style={[styles.inlineGuideLink, { color: colors.tx2 }]}>
          위젯 추가 방법
        </Text>
      </Callout>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.tx3 }]}>운동 시작 / 종료 위젯</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.controlScroller}
        >
          {/* PRE */}
          <ControlActionPreview
            accent={accent}
            actionFg={colors.accentText}
            actionLabel="운동 시작"
            eyebrow="다음 운동"
            previewTheme={previewTheme}
            subtitle="등 · 이두"
            title="Pull"
          />

          {/* DURING */}
          <ControlActionPreview
            accent={accent}
            actionBg={previewTheme.neutralButtonBackground}
            actionFg={previewTheme.neutralButtonText}
            actionLabel="운동 종료"
            eyebrow="운동 중"
            eyebrowAccent={accent}
            isTimer
            previewTheme={previewTheme}
            subtitle="등 · 이두"
            title="42:10"
          />

          {/* POST */}
          <ControlCompletedPreview
            accent={accent}
            detail="가슴 · 어깨 · 삼두"
            duration="1시간 8분"
            previewTheme={previewTheme}
            range="오후 7:24 – 오후 8:32"
            title="Push"
          />
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.tx3 }]}>히트맵 캘린더 위젯</Text>

        <View style={styles.smallRow}>
          <WidgetTypePreview
            label="Type 1"
            labelColor={previewTheme.typeLabelColor}
            style={styles.smallSquare}
          >
            <HeatmapWidgetPreview
              title={weekWidget.title}
              variant="week"
              widget={weekWidget}
              style={styles.typeSquareWidget}
            />
          </WidgetTypePreview>
          <WidgetTypePreview
            label="Type 2"
            labelColor={previewTheme.typeLabelColor}
            style={styles.smallSquare}
          >
            <HeatmapWidgetPreview
              title={monthWidget.title}
              variant="month"
              widget={monthWidget}
              style={styles.typeSquareWidget}
            />
          </WidgetTypePreview>
        </View>

        <WidgetTypePreview label="Type 3" labelColor={previewTheme.typeLabelColor}>
          <HeatmapWidgetPreview
            title={yearWidget.title}
            variant="year"
            widget={yearWidget}
            style={styles.mediumRect}
          />
        </WidgetTypePreview>
      </View>

      <WidgetGuideSheet visible={guideVisible} onClose={() => setGuideVisible(false)} />
    </Screen>
  );
}

const WIDGET_GUIDE_STEPS = [
  'iPhone 홈 화면의 빈 공간을 길게 누르기',
  '왼쪽 위 + 버튼 선택',
  `${BRAND.displayName} 검색`,
  '원하는 위젯을 선택하고 추가',
] as const;

function WidgetGuideSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();

  return (
    <BottomSheet visible={visible} title="위젯 추가 방법" onClose={onClose}>
      <AppText variant="body" tone="tertiary">
        앱에서 바로 설치되지는 않고, iPhone 홈 화면 편집 모드에서 직접 추가할 수 있어요.
      </AppText>

      <View style={styles.stepList}>
        {WIDGET_GUIDE_STEPS.map((step, index) => (
          <View key={step} style={styles.stepRow}>
            <View style={[styles.stepNumber, { backgroundColor: colors.surface2 }]}>
              <AppText variant="caption" weight="800" tone="secondary">
                {index + 1}
              </AppText>
            </View>
            <AppText variant="body" style={styles.stepText}>
              {step}
            </AppText>
          </View>
        ))}
      </View>

      <AppText variant="footnote" tone="muted">
        실제 홈 화면 위젯은 내 운동 상태와 기록으로 업데이트돼요. 이 페이지의 미리보기는
        디자인을 확인하기 위한 예시 데이터예요.
      </AppText>
    </BottomSheet>
  );
}

function ControlCompletedPreview({
  accent,
  detail,
  duration,
  previewTheme,
  range,
  title,
}: {
  accent: string;
  detail: string;
  duration: string;
  previewTheme: WidgetPreviewTheme;
  range: string;
  title: string;
}) {
  return (
    <View
      style={[
        styles.widgetCard,
        styles.controlCard,
        styles.controlActionCard,
        { backgroundColor: previewTheme.cardBackground, borderColor: previewTheme.cardBorder },
      ]}>
      <View style={styles.rowBetween}>
        <Text style={[styles.tinyLabel, { color: previewTheme.labelColor }]}>오늘 운동 완료</Text>
        <Text style={[styles.brand, { color: previewTheme.brandColor }]}>{BRAND.displayName}</Text>
      </View>

      <View style={styles.controlContentSlot}>
        <Text style={[styles.smallName, { color: previewTheme.titleColor }]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.partsStr, { color: previewTheme.detailColor }]} numberOfLines={1}>
          {detail}
        </Text>
      </View>

      <View
        style={[
          styles.completedFooterSlot,
          { height: range ? CONTROL.footerWithRangeHeight : CONTROL.buttonHeight },
        ]}>
        <Text style={[styles.smallDur, { color: accent }]}>{duration}</Text>
        {range ? (
          <Text style={[styles.smallRange, { color: previewTheme.detailColor }]} numberOfLines={1}>
            {range}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ControlActionPreview({
  accent,
  actionBg,
  actionFg,
  actionLabel,
  eyebrow,
  eyebrowAccent,
  isTimer = false,
  previewTheme,
  subtitle,
  title,
}: {
  accent: string;
  actionBg?: string;
  actionFg: string;
  actionLabel: string;
  eyebrow: string;
  eyebrowAccent?: string;
  isTimer?: boolean;
  previewTheme: WidgetPreviewTheme;
  subtitle?: string;
  title: string;
}) {
  return (
    <View
      style={[
        styles.widgetCard,
        styles.controlCard,
        styles.controlActionCard,
        { backgroundColor: previewTheme.cardBackground, borderColor: previewTheme.cardBorder },
      ]}>
      <View style={styles.rowBetween}>
        {eyebrowAccent ? (
          <View style={styles.duringHead}>
            <PulseDot color={eyebrowAccent} size={CONTROL.activeDotSize} />
            <Text style={[styles.tinyLabel, { color: eyebrowAccent }]}>{eyebrow}</Text>
          </View>
        ) : (
          <Text style={[styles.tinyLabel, { color: previewTheme.labelColor }]}>{eyebrow}</Text>
        )}
        <Text style={[styles.brand, { color: previewTheme.brandColor }]}>{BRAND.displayName}</Text>
      </View>

      <View style={styles.controlContentSlot}>
        <Text
          style={[
            isTimer ? styles.smallTimer : styles.smallName,
            { color: previewTheme.titleColor },
          ]}
          numberOfLines={isTimer ? 1 : 2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.partsStr, { color: previewTheme.detailColor }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <CtaPill label={actionLabel} bg={actionBg ?? accent} fg={actionFg} />
    </View>
  );
}

function buildWidgetPreviewTheme(colors: ThemeColors): WidgetPreviewTheme {
  return {
    cardBackground: colors.card,
    cardBorder: colors.border,
    labelColor: colors.tx3,
    brandColor: colors.tx5,
    titleColor: colors.tx,
    detailColor: colors.tx3,
    neutralButtonBackground: colors.surface2,
    neutralButtonText: colors.tx,
    typeLabelColor: colors.tx4,
  };
}

function buildPreviewHeatmapWidgets(colors: ThemeColors): {
  weekWidget: HeatmapWidgetProps;
  monthWidget: HeatmapWidgetProps;
  yearWidget: HeatmapWidgetProps;
} {
  const source = buildPreviewHeatmapSource(365);
  const weekCells = buildPreviewHeatmapDays(source, 7);
  const monthCells = buildPreviewHeatmapGrid(source, 30);
  const yearCells = buildPreviewHeatmapGrid(source, 365);
  const weekStats = rangeStatsFromCells(weekCells);
  const monthStats = rangeStatsFromCells(monthCells);
  const sixMonthStats = rangeStatsFromCells(recentSixMonthCells(yearCells));

  return {
    weekWidget: buildHeatmapWidgetProps({
      title: formatHeatmapWidgetTitle('지난 7일', weekStats.workoutCount),
      variant: 'week',
      cells: weekCells,
      colors,
      footer: buildPreviewWeekFooter(weekStats),
    }),
    monthWidget: buildHeatmapWidgetProps({
      title: formatHeatmapWidgetTitle('지난 30일', monthStats.workoutCount),
      variant: 'month',
      cells: monthCells,
      colors,
    }),
    yearWidget: buildHeatmapWidgetProps({
      title: formatSixMonthHeatmapWidgetTitle(sixMonthStats),
      variant: 'year',
      cells: yearCells,
      colors,
    }),
  };
}

function buildPreviewWeekFooter(stats: RangeStats): HeatmapWidgetFooterProps {
  return {
    footerStatLabels: '총 시간,평균',
    footerStatValues: `${formatDuration(stats.durationSeconds)},${formatDuration(
      averageDurationSeconds(stats)
    )}`,
    recentWorkoutLabel: '최근 운동',
    recentWorkoutTitles: 'Push · 1시간 8분,Pull · 48분',
    recentWorkoutMetas: '오늘,어제',
  };
}

function buildPreviewHeatmapSource(days: number): Map<string, HeatmapDay> {
  const today = startOfLocalDay(new Date());
  return new Map(
    Array.from({ length: days }, (_, index) => {
      const date = addLocalDays(today, index - days + 1);
      const cell = previewCellForDate(date, today);
      return [cell.dateKey, cell];
    })
  );
}

function buildPreviewHeatmapDays(source: Map<string, HeatmapDay>, days: number): HeatmapDay[] {
  const today = startOfLocalDay(new Date());
  return Array.from({ length: days }, (_, index) => {
    const date = addLocalDays(today, index - days + 1);
    return previewCellFromSource(source, date);
  });
}

function buildPreviewHeatmapGrid(source: Map<string, HeatmapDay>, days: number): HeatmapGridCell[] {
  const today = startOfLocalDay(new Date());
  const rangeStart = addLocalDays(today, -(days - 1));
  const gridStart = addLocalDays(rangeStart, -rangeStart.getDay());
  const cells: HeatmapGridCell[] = [];

  for (
    let cursor = gridStart;
    cursor.getTime() <= today.getTime();
    cursor = addLocalDays(cursor, 1)
  ) {
    const inRange = cursor.getTime() >= rangeStart.getTime();
    const cell = inRange ? previewCellFromSource(source, cursor) : emptyPreviewCell(cursor);
    cells.push({
      ...cell,
      inRange,
    });
  }

  return cells;
}

function previewCellFromSource(source: Map<string, HeatmapDay>, date: Date): HeatmapDay {
  return source.get(toLocalDateKey(date)) ?? emptyPreviewCell(date);
}

function previewCellForDate(date: Date, today: Date, inRange = true): HeatmapDay {
  const durationSeconds = inRange ? previewDurationSeconds(date, today) : 0;
  return {
    dateKey: toLocalDateKey(date),
    durationSeconds,
    bucket: heatmapBucketForDuration(durationSeconds),
  };
}

function emptyPreviewCell(date: Date): HeatmapDay {
  return {
    dateKey: toLocalDateKey(date),
    durationSeconds: 0,
    bucket: 0,
  };
}

function previewDurationSeconds(date: Date, today: Date): number {
  const daysAgo = daysBetween(date, today);
  const recentMinutes = recentPreviewWorkoutMinutes(daysAgo);
  if (recentMinutes !== null) {
    return recentMinutes * 60;
  }

  if (!isPreviewWorkoutDay(date)) {
    return 0;
  }

  const dateKey = toLocalDateKey(date);
  const durationRoll = seededUnit(`${dateKey}:duration`);
  const typeRoll = seededUnit(`${dateKey}:type`);
  let minutes = 38 + Math.round(durationRoll * 52);

  if (typeRoll < 0.12) {
    minutes = 28 + Math.round(seededUnit(`${dateKey}:short`) * 10);
  } else if (typeRoll > 0.88) {
    minutes += 10 + Math.round(seededUnit(`${dateKey}:long`) * 16);
  }

  return clamp(roundToNearest(minutes, 5), 28, 110) * 60;
}

function recentPreviewWorkoutMinutes(daysAgo: number): number | null {
  switch (daysAgo) {
    case 0:
      return 68;
    case 1:
      return 48;
    case 2:
      return 0;
    case 3:
      return 74;
    case 4:
      return 0;
    case 5:
      return 56;
    default:
      return null;
  }
}

function isPreviewWorkoutDay(date: Date): boolean {
  const dateKey = toLocalDateKey(date);
  const weekdayPreference = [0.26, 0.55, 0.4, 0.58, 0.36, 0.52, 0.44][date.getDay()];
  const weekRoll = seededUnit(`${weekKey(date)}:volume`);
  const weekBias = weekRoll < 0.14 ? -0.18 : weekRoll > 0.84 ? 0.16 : 0;
  const monthBias = (seededUnit(`${date.getFullYear()}-${date.getMonth()}:month`) - 0.5) * 0.1;
  return seededUnit(`${dateKey}:workout`) < weekdayPreference + weekBias + monthBias;
}

function heatmapBucketForDuration(durationSeconds: number): HeatmapBucket {
  if (durationSeconds <= 0) {
    return 0;
  }
  if (durationSeconds < 30 * 60) {
    return 1;
  }
  if (durationSeconds < 60 * 60) {
    return 2;
  }
  if (durationSeconds < 90 * 60) {
    return 3;
  }
  return 4;
}

function rangeStatsFromCells(cells: Array<HeatmapDay & { inRange?: boolean }>): RangeStats {
  const inRange = cells.filter((cell) => cell.inRange ?? true);
  const durationSeconds = inRange.reduce((sum, cell) => sum + cell.durationSeconds, 0);
  const workoutCount = inRange.filter((cell) => cell.durationSeconds > 0).length;
  return {
    workoutCount,
    durationSeconds,
    bySplit: [],
  };
}

function recentSixMonthCells(cells: HeatmapGridCell[]): HeatmapGridCell[] {
  const today = startOfLocalDay(new Date());
  const rangeStart = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  return cells.filter(
    (cell) => cell.inRange && dateFromKey(cell.dateKey).getTime() >= rangeStart.getTime()
  );
}

function averageDurationSeconds(stats: RangeStats): number {
  return stats.workoutCount ? Math.round(stats.durationSeconds / stats.workoutCount) : 0;
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function weekKey(date: Date): string {
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return `${date.getFullYear()}-${Math.floor(daysBetween(yearStart, date) / 7)}`;
}

function seededUnit(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The one small-widget CTA pill — PRE/DURING must share identical geometry. */
function CtaPill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.widgetCtaSm, { backgroundColor: bg }]}>
      <Text style={[styles.widgetCtaSmText, { color: fg }]}>{label}</Text>
    </View>
  );
}

function WidgetTypePreview({
  children,
  label,
  labelColor,
  style,
}: {
  children: ReactNode;
  label: string;
  labelColor: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.typePreview, style]}>
      <Text style={[styles.typeLabel, { color: labelColor }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  inlineGuideLink: {
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  stepList: {
    gap: spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  controlScroller: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  controlCard: {
    width: CONTROL.cardSize,
    aspectRatio: 1,
  },
  controlActionCard: {
    justifyContent: 'space-between',
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
  },
  smallName: {
    fontSize: CONTROL.text.title.size,
    lineHeight: CONTROL.text.title.lineHeight,
    fontWeight: CONTROL.text.title.weight,
    letterSpacing: 0,
  },
  smallTimer: {
    fontSize: CONTROL.text.timer.size,
    lineHeight: CONTROL.text.timer.lineHeight,
    fontWeight: CONTROL.text.timer.weight,
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
  controlContentSlot: {
    height: CONTROL.bodyHeight,
    justifyContent: 'center',
    gap: CONTROL.bodyGap,
  },
  smallRange: {
    fontSize: CONTROL.text.range.size,
    lineHeight: CONTROL.text.range.lineHeight,
    fontWeight: CONTROL.text.range.weight,
  },
  completedFooterSlot: {
    gap: CONTROL.footerGap,
    justifyContent: 'flex-start',
  },
  // iOS systemMedium proportions (~364x170pt). Content spreads vertically so
  // cards with less content keep the same footprint.
  mediumRect: {
    aspectRatio: 2.14,
    justifyContent: 'space-between',
  },
  typePreview: {
    gap: 7,
  },
  typeSquareWidget: {
    width: '100%',
    aspectRatio: 1,
  },
  typeLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  widgetCtaSm: {
    borderRadius: CONTROL.buttonRadius,
    alignItems: 'center',
    height: CONTROL.buttonHeight,
    justifyContent: 'center',
  },
  widgetCtaSmText: {
    fontSize: CONTROL.text.button.size,
    fontWeight: CONTROL.text.button.weight,
    lineHeight: CONTROL.text.button.lineHeight,
  },
  widgetCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: WIDGET_PREVIEW_SPEC.card.radius,
    padding: WIDGET_PREVIEW_SPEC.card.padding,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: CONTROL.headerHeight,
  },
  tinyLabel: {
    fontSize: WIDGET_PREVIEW_SPEC.text.label.size,
    lineHeight: WIDGET_PREVIEW_SPEC.text.label.lineHeight,
    fontWeight: WIDGET_PREVIEW_SPEC.text.label.weight,
    letterSpacing: 0,
  },
  brand: {
    fontSize: WIDGET_PREVIEW_SPEC.text.brand.size,
    lineHeight: WIDGET_PREVIEW_SPEC.text.brand.lineHeight,
    fontWeight: WIDGET_PREVIEW_SPEC.text.brand.weight,
  },
  partsStr: {
    fontSize: CONTROL.text.detail.size,
    lineHeight: CONTROL.text.detail.lineHeight,
    fontWeight: CONTROL.text.detail.weight,
  },
  duringHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: CONTROL.activeDotGap,
  },
  smallDur: {
    fontSize: CONTROL.text.duration.size,
    lineHeight: CONTROL.text.duration.lineHeight,
    fontWeight: CONTROL.text.duration.weight,
  },
});
