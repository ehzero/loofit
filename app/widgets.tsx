import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  Platform,
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
import { buildCurrentMonthHeatmapModel } from '@/src/widgets/current-month-heatmap-model';
import {
  buildHeatmapWidgetProps,
  formatHeatmapWidgetTitle,
  formatSixMonthHeatmapWidgetTitle,
  type HeatmapWidgetFooterProps,
} from '@/src/widgets/heatmap-widget-model';
import {
  buildWorkoutLockScreenCalendarFromCells,
  buildWorkoutLockScreenProps,
  lockScreenThemeFromColors,
} from '@/src/widgets/lock-screen-widget-model';
import { BodyPartDurationWidgetPreview } from '@/src/widgets/preview/BodyPartDurationWidgetPreview';
import { ExpandedHeatmapWidgetPreview } from '@/src/widgets/preview/ExpandedHeatmapWidgetPreview';
import { HeatmapWidgetPreview } from '@/src/widgets/preview/HeatmapWidgetPreview';
import { LockScreenCalendarWidgetPreview } from '@/src/widgets/preview/LockScreenCalendarWidgetPreview';
import { RoutineProgressLockScreenWidgetPreview } from '@/src/widgets/preview/RoutineProgressLockScreenWidgetPreview';
import {
  RoutineProgressTextListWidgetPreview,
  type RoutineProgressTextListItem,
} from '@/src/widgets/preview/RoutineProgressTextListWidgetPreview';
import { widgetColor } from '@/src/widgets/widget-design-system';
import { WIDGET_PREVIEW_SPEC, WIDGET_RENDERER_CONTRACT } from '@/src/widgets/widget-spec';
import type {
  HeatmapWidgetProps,
  WorkoutLockScreenCalendarWidgetProps,
  WorkoutLockScreenWidgetProps,
} from '@/src/widgets/types';

const CONTROL = WIDGET_PREVIEW_SPEC.control;
const WIDGET_DESIGN = WIDGET_RENDERER_CONTRACT.designSystem;
const WIDGET_TYPE = WIDGET_DESIGN.typography;
const WIDGET_WEIGHT = WIDGET_DESIGN.fontWeight;
const WIDGET_SPACE = WIDGET_DESIGN.spacing;
const WIDGET_RADIUS = WIDGET_DESIGN.radius;
const SINGLE_LINE_ELLIPSIS = {
  ellipsizeMode: 'tail' as const,
  numberOfLines: 1,
} as const;
const LOCK_SCREEN_TEXT = WIDGET_RENDERER_CONTRACT.lockScreen.text;
const LIVE_ACTIVITY_BANNER = WIDGET_RENDERER_CONTRACT.liveActivity.banner;
const LIVE_ACTIVITY_COMPACT = WIDGET_RENDERER_CONTRACT.liveActivity.compact;
const LIVE_ACTIVITY_MINIMAL = WIDGET_RENDERER_CONTRACT.liveActivity.minimal;
const LIVE_ACTIVITY_EXPANDED = WIDGET_RENDERER_CONTRACT.liveActivity.expanded;
const LIVE_ACTIVITY_PREVIEW = {
  banner: {
    buttonWidth: LIVE_ACTIVITY_BANNER.buttonWidth,
    buttonHeight: LIVE_ACTIVITY_BANNER.buttonHeight,
    buttonTextSize: LIVE_ACTIVITY_BANNER.buttonFontSize,
  },
  compact: {
    width: LIVE_ACTIVITY_COMPACT.previewWidth,
    height: LIVE_ACTIVITY_COMPACT.previewHeight,
    paddingHorizontal: LIVE_ACTIVITY_COMPACT.previewHorizontalPadding,
    timerWidth: LIVE_ACTIVITY_COMPACT.trailingWidth,
    fontSize: LIVE_ACTIVITY_COMPACT.fontSize,
  },
  minimal: {
    size: LIVE_ACTIVITY_MINIMAL.previewSize,
  },
  expanded: {
    width: LIVE_ACTIVITY_EXPANDED.previewWidth,
    height: LIVE_ACTIVITY_EXPANDED.previewHeight,
    horizontalPadding: LIVE_ACTIVITY_EXPANDED.horizontalPadding,
    titleWidth: LIVE_ACTIVITY_EXPANDED.titleWidth,
    timerLineHeight: LIVE_ACTIVITY_EXPANDED.timerLineHeight,
    buttonWidth: LIVE_ACTIVITY_EXPANDED.buttonWidth,
    buttonHeight: LIVE_ACTIVITY_EXPANDED.buttonHeight,
    buttonTextSize: LIVE_ACTIVITY_EXPANDED.buttonFontSize,
    gap: LIVE_ACTIVITY_EXPANDED.contentGap,
  },
} as const;

const DYNAMIC_ISLAND_PREVIEW = {
  background: '#000000',
  border: 'rgba(255,255,255,0.08)',
} as const;

const LOCK_SCREEN_WIDGET_PREVIEW = {
  inline: {
    height: 24,
  },
  circular: {
    size: 62,
  },
  rectangular: {
    width: 160,
    height: 72,
  },
} as const;

const LOCK_SCREEN_SYSTEM_PREVIEW = {
  surface: 'transparent',
  surfaceBorder: 'transparent',
  cellBorder: 'rgba(255,255,255,0.52)',
  primary: '#F4F4F2',
  secondary: '#A7A7AD',
  tertiary: '#707076',
  inactive: 'transparent',
} as const;

const ROUTINE_PROGRESS_PREVIEW_ITEMS: RoutineProgressTextListItem[] = [
  {
    split: 'Push',
    bodyParts: '가슴·어깨·삼두',
    duration: '1시간 8분',
    relativeDay: '어제',
  },
  {
    split: 'Pull',
    bodyParts: '등·이두',
    duration: '48분',
    relativeDay: '오늘',
  },
  { split: '', bodyParts: '하체', duration: '56분', relativeDay: '4일 전' },
];
const ROUTINE_PROGRESS_CURRENT_INDEX = 1;

type WidgetPreviewTheme = {
  cardBackground: string;
  cardBorder: string;
  labelColor: string;
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
  const routineProgressPalette = {
    accent,
    background: previewTheme.cardBackground,
    border: previewTheme.cardBorder,
    textLow: previewTheme.typeLabelColor,
  };
  const bodyPartDurationPalette = {
    accent,
    background: previewTheme.cardBackground,
    border: previewTheme.cardBorder,
    raisedSurface: previewTheme.neutralButtonBackground,
    textHigh: previewTheme.titleColor,
    textMedium: previewTheme.detailColor,
  };
  const {
    currentMonthTitle,
    currentMonthWidget,
    expandedFourWeekBodyPartLabels,
    expandedFourWeekWidget,
    weekWidget,
    monthWidget,
    yearWidget,
  } = useMemo(() => buildPreviewHeatmapWidgets(colors), [colors]);
  const lockScreenPreview = useMemo(() => buildPreviewLockScreenWidgets(colors), [colors]);
  const isAndroid = Platform.OS === 'android';
  const compactSizeLabel = isAndroid ? '소형' : 'Small';
  const expandedSizeLabel = isAndroid ? '중형' : 'Medium';

  return (
    <Screen title="위젯" onBack={() => router.back()}>
      <Callout icon="info">
        위젯은 휴대폰 홈 화면과 잠금화면에 추가해서 사용해요. 미리보기는 예시 데이터로
        표시돼요.{' '}
        <Text
          accessibilityRole="button"
          onPress={() => setGuideVisible(true)}
          style={[styles.inlineGuideLink, { color: colors.tx2 }]}>
          위젯 추가 방법
        </Text>
      </Callout>

      <View style={styles.section}>
        <SectionLabelWithRule
          label="홈 화면 위젯"
          labelColor={colors.tx3}
          lineColor={colors.tx3}
        />

        <View style={styles.previewGroup}>
          <Text style={[styles.typeLabel, { color: previewTheme.typeLabelColor }]}>
            운동 위젯 · {compactSizeLabel}
          </Text>
          <ScrollView
            horizontal
            style={styles.carouselBleed}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.controlScroller}
          >
            <ControlActionPreview
              accent={accent}
              actionFg={colors.accentText}
              actionLabel="운동 시작"
              eyebrow="다음 운동"
              previewTheme={previewTheme}
              subtitle="등 · 이두"
              title="Pull"
            />

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

        <View style={styles.previewGroup}>
          <Text style={[styles.typeLabel, { color: previewTheme.typeLabelColor }]}>
            히트맵 위젯
          </Text>
          <View style={styles.smallRow}>
            <WidgetTypePreview
              label={`${compactSizeLabel} · 지난 7일`}
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
              label={`${compactSizeLabel} · 지난 5주`}
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

          <View style={styles.smallRow}>
            <WidgetTypePreview
              label={`${compactSizeLabel} · 이번 달`}
              labelColor={previewTheme.typeLabelColor}
              style={styles.smallSquareSingle}
            >
              <HeatmapWidgetPreview
                title={currentMonthTitle}
                variant="month"
                widget={currentMonthWidget}
                showHeader={
                  WIDGET_RENDERER_CONTRACT.heatmap.previewVariants.currentMonth.headerVisible
                }
                style={styles.typeSquareWidget}
              />
            </WidgetTypePreview>
          </View>

          <WidgetTypePreview
            label={`${expandedSizeLabel} · 지난 4주 상세`}
            labelColor={previewTheme.typeLabelColor}
          >
            <ExpandedHeatmapWidgetPreview
              bodyPartLabels={expandedFourWeekBodyPartLabels}
              widget={expandedFourWeekWidget}
            />
          </WidgetTypePreview>

          <WidgetTypePreview
            label={`${expandedSizeLabel} · 지난 6개월`}
            labelColor={previewTheme.typeLabelColor}>
            <HeatmapWidgetPreview
              title={yearWidget.title}
              variant="year"
              widget={yearWidget}
              style={styles.mediumRect}
            />
          </WidgetTypePreview>
        </View>

        <View style={styles.previewGroup}>
          <Text style={[styles.typeLabel, { color: previewTheme.typeLabelColor }]}>루틴 진행 위젯</Text>
          <View style={styles.smallRow}>
            <WidgetTypePreview
              label={`${compactSizeLabel} · 텍스트 목록`}
              labelColor={previewTheme.typeLabelColor}
              style={styles.smallSquareSingle}
            >
              <RoutineProgressTextListWidgetPreview
                currentIndex={ROUTINE_PROGRESS_CURRENT_INDEX}
                items={ROUTINE_PROGRESS_PREVIEW_ITEMS}
                palette={routineProgressPalette}
              />
            </WidgetTypePreview>
          </View>
        </View>

        <View style={styles.previewGroup}>
          <Text style={[styles.typeLabel, { color: previewTheme.typeLabelColor }]}>운동 분석 위젯</Text>
          <View style={styles.smallRow}>
            <WidgetTypePreview
              label={`${compactSizeLabel} · 최근 30일 부위별 시간`}
              labelColor={previewTheme.typeLabelColor}
              style={styles.smallSquareSingle}
            >
              <BodyPartDurationWidgetPreview
                items={[
                  { bodyPart: '가슴', durationSeconds: 6 * 3600 + 25 * 60 },
                  { bodyPart: '등', durationSeconds: 5 * 3600 + 40 * 60 },
                  { bodyPart: '하체', durationSeconds: 4 * 3600 + 15 * 60 },
                  { bodyPart: '어깨', durationSeconds: 2 * 3600 + 30 * 60 },
                ]}
                palette={bodyPartDurationPalette}
              />
            </WidgetTypePreview>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionLabelWithRule
          label="잠금화면 위젯"
          labelColor={colors.tx3}
          lineColor={colors.tx3}
        />

        <LockScreenWidgetsPreview
          previewTheme={previewTheme}
          calendar={lockScreenPreview.calendar}
          nextCalendar={lockScreenPreview.nextCalendar}
          states={lockScreenPreview.states}
        />
      </View>

      <View style={styles.section}>
        <SectionLabelWithRule
          label={isAndroid ? '운동 중 고정 알림' : '운동 중 표시'}
          labelColor={colors.tx3}
          lineColor={colors.tx3}
        />

        <LiveActivityBannerPreview
          accent={accent}
          accentText={colors.accentText}
          elapsed="42:10"
          previewTheme={previewTheme}
          title="하체 · 어깨"
        />

        {!isAndroid ? (
          <DynamicIslandPreview
            accent={accent}
            accentText={colors.accentText}
            elapsed="2:08:33"
            previewTheme={previewTheme}
            title="하체 · 어깨"
          />
        ) : null}
      </View>

      <WidgetGuideSheet visible={guideVisible} onClose={() => setGuideVisible(false)} />
    </Screen>
  );
}

const IOS_WIDGET_GUIDE_STEPS = [
  '홈 화면 또는 잠금화면의 빈 공간을 길게 누르기',
  '홈 화면은 + 버튼, 잠금화면은 사용자화 선택',
  `${BRAND.displayName} 검색`,
  '원하는 위젯을 선택하고 추가',
] as const;

const ANDROID_WIDGET_GUIDE_STEPS = [
  '홈 화면의 빈 공간을 길게 누르기',
  '위젯 메뉴 선택',
  `${BRAND.displayName} 검색`,
  '원하는 위젯을 길게 눌러 홈 화면에 배치',
] as const;

function WidgetGuideSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const isAndroid = Platform.OS === 'android';
  const steps = isAndroid ? ANDROID_WIDGET_GUIDE_STEPS : IOS_WIDGET_GUIDE_STEPS;

  return (
    <BottomSheet visible={visible} title="위젯 추가 방법" onClose={onClose}>
      <AppText variant="body" tone="tertiary">
        {isAndroid
          ? '앱에서 바로 설치되지는 않고, Android 홈 화면의 위젯 메뉴에서 직접 추가할 수 있어요. 잠금화면 위젯은 지원하는 기기에서 같은 위젯을 추가할 수 있어요.'
          : '앱에서 바로 설치되지는 않고, iPhone 홈 화면 또는 잠금화면 편집 모드에서 직접 추가할 수 있어요.'}
      </AppText>

      <View style={styles.stepList}>
        {steps.map((step, index) => (
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

function SectionLabelWithRule({
  label,
  labelColor,
  lineColor,
}: {
  label: string;
  labelColor: string;
  lineColor: string;
}) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={[styles.sectionLabel, { color: labelColor }]}>{label}</Text>
      <View style={[styles.sectionRule, { backgroundColor: lineColor }]} />
    </View>
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
      </View>

      <View style={styles.controlContentSlot}>
        <Text
          {...SINGLE_LINE_ELLIPSIS}
          adjustsFontSizeToFit
          minimumFontScale={WIDGET_DESIGN.minimumScale.default}
          style={[styles.smallName, { color: previewTheme.titleColor }]}
        >
          {title}
        </Text>
        <Text
          {...SINGLE_LINE_ELLIPSIS}
          style={[styles.partsStr, { color: previewTheme.detailColor }]}
        >
          {detail}
        </Text>
      </View>

      <View style={styles.completedFooterSlot}>
        <Text {...SINGLE_LINE_ELLIPSIS} style={[styles.smallDur, { color: accent }]}>
          {duration}
        </Text>
        {range ? (
          <Text
            {...SINGLE_LINE_ELLIPSIS}
            style={[styles.smallRange, { color: previewTheme.detailColor }]}
          >
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
      </View>

      <View style={styles.controlContentSlot}>
        <Text
          {...SINGLE_LINE_ELLIPSIS}
          adjustsFontSizeToFit={!isTimer}
          minimumFontScale={WIDGET_DESIGN.minimumScale.default}
          style={[
            isTimer ? styles.smallTimer : styles.smallName,
            { color: previewTheme.titleColor },
          ]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            {...SINGLE_LINE_ELLIPSIS}
            style={[styles.partsStr, { color: previewTheme.detailColor }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      <CtaPill label={actionLabel} bg={actionBg ?? accent} fg={actionFg} />
    </View>
  );
}

function LockScreenWidgetsPreview({
  calendar,
  nextCalendar,
  previewTheme,
  states,
}: {
  calendar: WorkoutLockScreenCalendarWidgetProps;
  nextCalendar: WorkoutLockScreenCalendarWidgetProps;
  previewTheme: WidgetPreviewTheme;
  states: {
    idle: WorkoutLockScreenWidgetProps;
    active: WorkoutLockScreenWidgetProps;
    completed: WorkoutLockScreenWidgetProps;
  };
}) {
  return (
    <View style={styles.lockScreenPreviewList}>
      <View style={styles.previewGroup}>
        <Text style={[styles.typeLabel, { color: previewTheme.typeLabelColor }]}>
          Inline · 한 줄
        </Text>
        <View style={styles.lockInlineWidget}>
          <Text
            style={[styles.lockInlineText, { color: LOCK_SCREEN_SYSTEM_PREVIEW.primary }]}
            numberOfLines={1}>
            {states.idle.inlineText}
          </Text>
        </View>
      </View>

      <View style={styles.previewGroup}>
        <Text style={[styles.typeLabel, { color: previewTheme.typeLabelColor }]}>
          Circular · 원형
        </Text>
        <View style={styles.lockCircularStateRow}>
          <CircularStatePreview
            accent={LOCK_SCREEN_SYSTEM_PREVIEW.primary}
            backgroundColor={LOCK_SCREEN_SYSTEM_PREVIEW.surface}
            borderColor={LOCK_SCREEN_SYSTEM_PREVIEW.surfaceBorder}
            value={states.idle.circularValue}
          />
          <CircularStatePreview
            accent={LOCK_SCREEN_SYSTEM_PREVIEW.primary}
            backgroundColor={LOCK_SCREEN_SYSTEM_PREVIEW.surface}
            borderColor={LOCK_SCREEN_SYSTEM_PREVIEW.surfaceBorder}
            value={states.active.circularValue}
          />
          <CircularStatePreview
            accent={LOCK_SCREEN_SYSTEM_PREVIEW.primary}
            backgroundColor={LOCK_SCREEN_SYSTEM_PREVIEW.surface}
            borderColor={LOCK_SCREEN_SYSTEM_PREVIEW.surfaceBorder}
            value={states.completed.circularValue}
          />
        </View>
      </View>

      <View style={styles.previewGroup}>
        <Text style={[styles.typeLabel, { color: previewTheme.typeLabelColor }]}>
          Rectangular Type A · 상태
        </Text>
        <ScrollView
          horizontal
          style={styles.carouselBleed}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.lockRectStateRow}>
          <RectangularStatusPreview
            title={states.idle.rectangularTitle}
            detail={states.idle.rectangularDetail}
          />
          <RectangularStatusPreview
            title={states.active.rectangularTitle}
            detail={states.active.rectangularDetail}
          />
          <RectangularStatusPreview
            title={states.completed.rectangularTitle}
            detail={states.completed.rectangularDetail}
          />
        </ScrollView>
      </View>

      <View style={styles.previewGroup}>
        <Text style={[styles.typeLabel, { color: previewTheme.typeLabelColor }]}>
          Rectangular Type B · 지난 3주
        </Text>
        <LockScreenCalendarWidgetPreview
          calendar={calendar}
          palette={{
            inverse: previewTheme.cardBackground,
            primary: LOCK_SCREEN_SYSTEM_PREVIEW.primary,
            secondary: LOCK_SCREEN_SYSTEM_PREVIEW.secondary,
          }}
          style={styles.lockRectangularCalendarWidget}
        />
      </View>

      <View style={styles.previewGroup}>
        <Text style={[styles.typeLabel, { color: previewTheme.typeLabelColor }]}>
          Rectangular Type C · 다음 3주
        </Text>
        <LockScreenCalendarWidgetPreview
          calendar={nextCalendar}
          palette={{
            inverse: previewTheme.cardBackground,
            primary: LOCK_SCREEN_SYSTEM_PREVIEW.primary,
            secondary: LOCK_SCREEN_SYSTEM_PREVIEW.secondary,
          }}
          style={styles.lockRectangularCalendarWidget}
        />
      </View>

      <View style={styles.previewGroup}>
        <Text style={[styles.typeLabel, { color: previewTheme.typeLabelColor }]}>
          Rectangular Type D · 루틴 진행
        </Text>
        <RoutineProgressLockScreenWidgetPreview
          currentIndex={ROUTINE_PROGRESS_CURRENT_INDEX}
          items={ROUTINE_PROGRESS_PREVIEW_ITEMS}
          palette={{
            background: LOCK_SCREEN_SYSTEM_PREVIEW.surface,
            border: LOCK_SCREEN_SYSTEM_PREVIEW.surfaceBorder,
            textHigh: LOCK_SCREEN_SYSTEM_PREVIEW.primary,
            textLow: LOCK_SCREEN_SYSTEM_PREVIEW.tertiary,
          }}
          style={styles.lockRectangularRoutineWidget}
        />
      </View>
    </View>
  );
}

function RectangularStatusPreview({
  detail,
  title,
}: {
  detail: string;
  title: string;
}) {
  return (
    <View
      style={[
        styles.lockRectangularWidget,
        styles.lockRectangularStatusWidget,
        {
          backgroundColor: LOCK_SCREEN_SYSTEM_PREVIEW.surface,
          borderColor: LOCK_SCREEN_SYSTEM_PREVIEW.surfaceBorder,
        },
      ]}>
      <Text
        style={[styles.lockRectStatusTitle, { color: LOCK_SCREEN_SYSTEM_PREVIEW.primary }]}
        numberOfLines={1}>
        {title}
      </Text>
      <Text
        style={[styles.lockRectStatusDetail, { color: LOCK_SCREEN_SYSTEM_PREVIEW.secondary }]}
        numberOfLines={1}>
        {detail}
      </Text>
    </View>
  );
}

function CircularStatePreview({
  accent,
  backgroundColor,
  borderColor,
  value,
}: {
  accent: string;
  backgroundColor: string;
  borderColor: string;
  value: string;
}) {
  return (
    <View style={styles.lockCircularStateItem}>
      <View style={[styles.lockCircularWidget, { backgroundColor, borderColor }]}>
        <Text
          style={[styles.lockCircularValue, { color: accent }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.65}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function LiveActivityBannerPreview({
  accent,
  accentText,
  elapsed,
  previewTheme,
  title,
}: {
  accent: string;
  accentText: string;
  elapsed: string;
  previewTheme: WidgetPreviewTheme;
  title: string;
}) {
  const compactTitle = compactWorkoutTitle(title);

  return (
    <View style={styles.livePreviewItem}>
      <Text style={[styles.typeLabel, { color: previewTheme.typeLabelColor }]}>
        Live Activity · 잠금화면
      </Text>
      <View
        style={[
          styles.liveBanner,
          { backgroundColor: previewTheme.cardBackground, borderColor: previewTheme.cardBorder },
        ]}>
        <View style={styles.liveBannerHeader}>
          <Text
            {...SINGLE_LINE_ELLIPSIS}
            style={[styles.liveBannerTitle, { color: previewTheme.titleColor }]}
            adjustsFontSizeToFit
            minimumFontScale={WIDGET_DESIGN.minimumScale.default}
          >
            {title || compactTitle}
          </Text>
          <Text style={[styles.liveStatusText, { color: accent }]}>운동 중</Text>
        </View>
        <View style={styles.liveBannerFooter}>
          <Text {...SINGLE_LINE_ELLIPSIS} style={[styles.liveBannerTimer, { color: accent }]}>
            {elapsed}
          </Text>
          <StopPill accent={accent} accentText={accentText} />
        </View>
      </View>
    </View>
  );
}

function DynamicIslandPreview({
  accent,
  accentText,
  elapsed,
  previewTheme,
  title,
}: {
  accent: string;
  accentText: string;
  elapsed: string;
  previewTheme: WidgetPreviewTheme;
  title: string;
}) {
  const compactTitle = compactWorkoutTitle(title);
  const minimalTitle = minimalWorkoutTitle(title);

  return (
    <View style={styles.livePreviewItem}>
      <Text style={[styles.typeLabel, { color: previewTheme.typeLabelColor }]}>
        Dynamic Island · compact / minimal / expanded
      </Text>
      <ScrollView
        horizontal
        style={styles.carouselBleed}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.liveIslandScroller}
      >
        <View
          style={[
            styles.liveIslandCompact,
            {
              backgroundColor: DYNAMIC_ISLAND_PREVIEW.background,
              borderColor: DYNAMIC_ISLAND_PREVIEW.border,
            },
          ]}>
          <Text
            style={[styles.liveCompactLeadingText, { color: accent }]}
            numberOfLines={1}
          >
            {`🏋️ ${compactTitle}`}
          </Text>
          <Text
            style={[styles.liveCompactTrailingText, { color: accent }]}
            numberOfLines={1}
          >
            {elapsed}
          </Text>
        </View>

        <View
          style={[
            styles.liveIslandMinimal,
            {
              backgroundColor: DYNAMIC_ISLAND_PREVIEW.background,
              borderColor: DYNAMIC_ISLAND_PREVIEW.border,
            },
          ]}>
          <Text
            style={[styles.liveMinimalText, { color: accent }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            {minimalTitle}
          </Text>
        </View>

        <View
          style={[
            styles.liveIslandExpanded,
            {
              backgroundColor: DYNAMIC_ISLAND_PREVIEW.background,
              borderColor: DYNAMIC_ISLAND_PREVIEW.border,
            },
          ]}>
          <View style={styles.liveIslandExpandedRow}>
            <Text
              style={[
                styles.liveExpandedTitle,
                { color: previewTheme.titleColor },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={LIVE_ACTIVITY_EXPANDED.titleMinimumScaleFactor}
            >
              {title}
            </Text>
            <View style={styles.liveIslandExpandedCenter}>
              <Text
                style={[styles.liveExpandedTimer, { color: accent }]}
                numberOfLines={1}
              >
                {elapsed}
              </Text>
            </View>
            <StopPill accent={accent} accentText={accentText} variant="expanded" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function StopPill({
  accent,
  accentText,
  variant = 'banner',
}: {
  accent: string;
  accentText: string;
  variant?: 'banner' | 'expanded';
}) {
  const compact = variant === 'expanded';

  return (
    <View
      style={[
        styles.liveStopPill,
        compact ? styles.liveStopPillCompact : null,
        { backgroundColor: accent },
      ]}>
      <Text
        style={[
          styles.liveStopLabel,
          compact ? styles.liveStopLabelCompact : null,
          { color: accentText },
        ]}>
        운동 종료
      </Text>
    </View>
  );
}

function compactWorkoutTitle(title: string): string {
  const parts = title.split(' · ').filter(Boolean);
  return parts.length > 0 ? parts.join('·') : title;
}

function minimalWorkoutTitle(title: string): string {
  return (title.split(' · ')[0] || title).slice(0, 4);
}

function buildWidgetPreviewTheme(colors: ThemeColors): WidgetPreviewTheme {
  return {
    cardBackground: widgetColor(colors, 'surface'),
    cardBorder: colors.border,
    labelColor: widgetColor(colors, 'textMedium'),
    titleColor: widgetColor(colors, 'textHigh'),
    detailColor: widgetColor(colors, 'textMedium'),
    neutralButtonBackground: widgetColor(colors, 'raisedSurface'),
    neutralButtonText: widgetColor(colors, 'textHigh'),
    typeLabelColor: widgetColor(colors, 'textLow'),
  };
}

function buildPreviewHeatmapWidgets(colors: ThemeColors): {
  currentMonthTitle: string;
  currentMonthWidget: HeatmapWidgetProps;
  expandedFourWeekBodyPartLabels: string[];
  expandedFourWeekWidget: HeatmapWidgetProps;
  weekWidget: HeatmapWidgetProps;
  monthWidget: HeatmapWidgetProps;
  yearWidget: HeatmapWidgetProps;
} {
  const source = buildPreviewHeatmapSource(365);
  const weekCells = buildPreviewHeatmapDays(source, 7);
  const monthCells = buildPreviewCalendarWeeks(
    source,
    WIDGET_RENDERER_CONTRACT.heatmap.variants.month.rangeWeeks
  );
  const expandedFourWeekCells = buildPreviewCalendarWeeks(
    source,
    WIDGET_RENDERER_CONTRACT.heatmap.previewVariants.fourWeekExpanded.rangeWeeks
  );
  const currentMonth = buildCurrentMonthHeatmapModel(source);
  const yearCells = buildPreviewHeatmapGrid(source, 365);
  const weekStats = rangeStatsFromCells(weekCells);
  const monthStats = rangeStatsFromCells(monthCells);
  const currentMonthStats = rangeStatsFromCells(currentMonth.cells);
  const sixMonthStats = rangeStatsFromCells(recentSixMonthCells(yearCells));
  const currentMonthTitle = formatHeatmapWidgetTitle(
    currentMonth.title,
    currentMonthStats.workoutCount
  );

  return {
    currentMonthTitle,
    currentMonthWidget: buildHeatmapWidgetProps({
      title: currentMonthTitle,
      variant: 'month',
      cells: currentMonth.cells,
      colors,
    }),
    expandedFourWeekBodyPartLabels: buildPreviewBodyPartLabels(expandedFourWeekCells),
    expandedFourWeekWidget: buildHeatmapWidgetProps({
      title: '지난 4주',
      variant: 'month',
      cells: expandedFourWeekCells,
      colors,
    }),
    weekWidget: buildHeatmapWidgetProps({
      title: formatHeatmapWidgetTitle(
        WIDGET_RENDERER_CONTRACT.heatmap.variants.week.title,
        weekStats.workoutCount
      ),
      variant: 'week',
      cells: weekCells,
      colors,
      footer: buildPreviewWeekFooter(weekStats),
    }),
    monthWidget: buildHeatmapWidgetProps({
      title: formatHeatmapWidgetTitle(
        WIDGET_RENDERER_CONTRACT.heatmap.variants.month.title,
        monthStats.workoutCount
      ),
      variant: 'month',
      cells: monthCells,
      colors,
      footer: buildPreviewMonthFooter(monthStats),
    }),
    yearWidget: buildHeatmapWidgetProps({
      title: formatSixMonthHeatmapWidgetTitle(sixMonthStats),
      variant: 'year',
      cells: yearCells,
      colors,
    }),
  };
}

function buildPreviewBodyPartLabels(cells: HeatmapGridCell[]): string[] {
  const separator = WIDGET_RENDERER_CONTRACT.heatmap.previewVariants.fourWeekExpanded.bodyPartSeparator;
  const bodyPartGroups = [
    ['가슴', '어깨', '삼두'].join(separator),
    ['등', '이두'].join(separator),
    '하체',
    '어깨',
  ];
  let workoutIndex = 0;

  return cells.map((cell) => {
    if (cell.durationSeconds <= 0) {
      return '';
    }
    const label = bodyPartGroups[workoutIndex % bodyPartGroups.length] ?? '';
    workoutIndex += 1;
    return label;
  });
}

function buildPreviewLockScreenWidgets(colors: ThemeColors): {
  calendar: WorkoutLockScreenCalendarWidgetProps;
  nextCalendar: WorkoutLockScreenCalendarWidgetProps;
  states: {
    idle: WorkoutLockScreenWidgetProps;
    active: WorkoutLockScreenWidgetProps;
    completed: WorkoutLockScreenWidgetProps;
  };
} {
  const now = new Date();
  const startedAt = new Date(now.getTime() - 42 * 60 * 1000).toISOString();
  const theme = lockScreenThemeFromColors(colors);
  const calendarSpec = WIDGET_RENDERER_CONTRACT.lockScreen.threeWeekCalendar;
  const source = buildPreviewHeatmapSource(calendarSpec.rangeWeeks * calendarSpec.columns);
  const calendarCells = buildPreviewCompleteCalendarWeeks(source, calendarSpec.rangeWeeks);
  const nextCalendarCells = buildPreviewUpcomingCompleteCalendarWeeks(
    source,
    WIDGET_RENDERER_CONTRACT.lockScreen.nextThreeWeekCalendar.rangeWeeks
  );

  return {
    calendar: buildWorkoutLockScreenCalendarFromCells({
      cells: calendarCells,
      todayDateKey: toLocalDateKey(now),
    }),
    nextCalendar: buildWorkoutLockScreenCalendarFromCells({
      cells: nextCalendarCells,
      todayDateKey: toLocalDateKey(now),
    }),
    states: {
      idle: buildWorkoutLockScreenProps({
        state: 'idle',
        title: 'Pull',
        detail: '등 · 이두',
        ...theme,
      }),
      active: buildWorkoutLockScreenProps({
        state: 'active',
        title: '등 · 이두',
        startedAt,
        now,
        ...theme,
      }),
      completed: buildWorkoutLockScreenProps({
        state: 'completed',
        title: 'Push',
        durationLabel: '1시간 8분',
        ...theme,
      }),
    },
  };
}

function buildPreviewCompleteCalendarWeeks(
  source: Map<string, HeatmapDay>,
  weeks: number
): HeatmapDay[] {
  const today = startOfLocalDay(new Date());
  const currentWeekStart = addLocalDays(today, -today.getDay());
  const rangeStart = addLocalDays(currentWeekStart, -(Math.max(weeks, 1) - 1) * 7);
  const cellCount = Math.max(weeks, 1) * 7;

  return Array.from({ length: cellCount }, (_, index) =>
    previewCellFromSource(source, addLocalDays(rangeStart, index))
  );
}

function buildPreviewUpcomingCompleteCalendarWeeks(
  source: Map<string, HeatmapDay>,
  weeks: number
): HeatmapDay[] {
  const today = startOfLocalDay(new Date());
  const currentWeekStart = addLocalDays(today, -today.getDay());
  const cellCount = Math.max(weeks, 1) * 7;

  return Array.from({ length: cellCount }, (_, index) =>
    previewCellFromSource(source, addLocalDays(currentWeekStart, index))
  );
}

function buildPreviewWeekFooter(stats: RangeStats): HeatmapWidgetFooterProps {
  const hasRecentWorkout = stats.workoutCount > 0;
  const footer = WIDGET_RENDERER_CONTRACT.heatmap.weekFooter;

  return {
    footerStatLabels: footer.statLabels.join(','),
    footerStatValues: `${stats.workoutCount}회,${formatDuration(stats.durationSeconds)},${formatDuration(
      averageDurationSeconds(stats)
    )}`,
    recentWorkoutLabel: footer.recentLabel,
    recentWorkoutTitles: hasRecentWorkout ? 'Push · 1시간 8분,Pull · 48분' : '',
    recentWorkoutMetas: hasRecentWorkout ? '오늘,어제' : '',
  };
}

function buildPreviewMonthFooter(stats: RangeStats): HeatmapWidgetFooterProps {
  return {
    footerStatLabels: '',
    footerStatValues: `${stats.workoutCount}회,${formatDuration(stats.durationSeconds)}`,
    recentWorkoutLabel: '',
    recentWorkoutTitles: '',
    recentWorkoutMetas: '',
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

function buildPreviewCalendarWeeks(
  source: Map<string, HeatmapDay>,
  weeks: number
): HeatmapGridCell[] {
  const today = startOfLocalDay(new Date());
  const currentWeekStart = addLocalDays(today, -today.getDay());
  const rangeStart = addLocalDays(currentWeekStart, -(Math.max(weeks, 1) - 1) * 7);
  const cells: HeatmapGridCell[] = [];

  for (
    let cursor = rangeStart;
    cursor.getTime() <= today.getTime();
    cursor = addLocalDays(cursor, 1)
  ) {
    cells.push({
      ...previewCellFromSource(source, cursor),
      inRange: true,
    });
  }

  return cells;
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
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sectionRule: {
    flex: 1,
    height: 1,
  },
  carouselBleed: {
    marginHorizontal: -spacing.lg,
  },
  controlScroller: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  previewGroup: {
    gap: 7,
  },
  livePreviewItem: {
    gap: WIDGET_SPACE.md,
  },
  lockScreenPreviewList: {
    gap: spacing.md,
  },
  lockInlineWidget: {
    height: LOCK_SCREEN_WIDGET_PREVIEW.inline.height,
    borderRadius: LOCK_SCREEN_WIDGET_PREVIEW.inline.height / 2,
    paddingHorizontal: WIDGET_SPACE.sm,
    justifyContent: 'center',
  },
  lockInlineText: {
    fontSize: LOCK_SCREEN_TEXT.inline.size,
    lineHeight: LOCK_SCREEN_TEXT.inline.lineHeight,
    fontWeight: LOCK_SCREEN_TEXT.inline.weight,
    textAlign: 'center',
  },
  lockCircularStateRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: WIDGET_SPACE.sm,
  },
  lockCircularStateItem: {
    alignItems: 'center',
  },
  lockCircularWidget: {
    width: LOCK_SCREEN_WIDGET_PREVIEW.circular.size,
    height: LOCK_SCREEN_WIDGET_PREVIEW.circular.size,
    borderRadius: LOCK_SCREEN_WIDGET_PREVIEW.circular.size / 2,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockCircularValue: {
    fontSize: LOCK_SCREEN_TEXT.circular.size,
    lineHeight: LOCK_SCREEN_TEXT.circular.lineHeight,
    fontWeight: LOCK_SCREEN_TEXT.circular.weight,
    fontVariant: ['tabular-nums'],
  },
  lockRectangularWidget: {
    width: LOCK_SCREEN_WIDGET_PREVIEW.rectangular.width,
    height: LOCK_SCREEN_WIDGET_PREVIEW.rectangular.height,
    borderRadius: 0,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: 'space-between',
  },
  lockRectangularStatusWidget: {
    justifyContent: 'center',
    gap: WIDGET_SPACE.xs,
  },
  lockRectangularRoutineWidget: {
    borderRadius: 0,
    height: LOCK_SCREEN_WIDGET_PREVIEW.rectangular.height,
    width: LOCK_SCREEN_WIDGET_PREVIEW.rectangular.width,
  },
  lockRectangularCalendarWidget: {
    height: LOCK_SCREEN_WIDGET_PREVIEW.rectangular.height,
    width: LOCK_SCREEN_WIDGET_PREVIEW.rectangular.width,
  },
  lockRectStateRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  lockRectStatusTitle: {
    alignSelf: 'stretch',
    fontSize: LOCK_SCREEN_TEXT.rectangularTitle.size,
    lineHeight: LOCK_SCREEN_TEXT.rectangularTitle.lineHeight,
    fontWeight: LOCK_SCREEN_TEXT.rectangularTitle.weight,
    textAlign: 'center',
  },
  lockRectStatusDetail: {
    alignSelf: 'stretch',
    fontSize: LOCK_SCREEN_TEXT.rectangularDetail.size,
    lineHeight: LOCK_SCREEN_TEXT.rectangularDetail.lineHeight,
    fontWeight: LOCK_SCREEN_TEXT.rectangularDetail.weight,
    textAlign: 'center',
  },
  liveBanner: {
    minHeight: LIVE_ACTIVITY_BANNER.minHeight,
    borderRadius: WIDGET_RADIUS.container,
    borderWidth: StyleSheet.hairlineWidth,
    padding: LIVE_ACTIVITY_BANNER.contentPadding,
    gap: LIVE_ACTIVITY_BANNER.contentGap,
    justifyContent: 'center',
  },
  liveBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: LIVE_ACTIVITY_BANNER.rowGap,
  },
  liveBannerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: LIVE_ACTIVITY_BANNER.rowGap,
  },
  liveStatusText: {
    flexShrink: 0,
    fontSize: LIVE_ACTIVITY_BANNER.statusFontSize,
    lineHeight: WIDGET_TYPE.md.lineHeight,
    fontWeight: WIDGET_WEIGHT.bold,
  },
  liveBannerTitle: {
    flex: 1,
    flexShrink: 1,
    fontSize: LIVE_ACTIVITY_BANNER.titleFontSize,
    lineHeight: WIDGET_TYPE.lg.lineHeight,
    fontWeight: WIDGET_WEIGHT.bold,
  },
  liveBannerTimer: {
    flex: 1,
    fontSize: LIVE_ACTIVITY_BANNER.timerFontSize,
    lineHeight: WIDGET_TYPE.xl.lineHeight,
    fontWeight: WIDGET_WEIGHT.bold,
    fontVariant: ['tabular-nums'],
  },
  liveStopPill: {
    width: LIVE_ACTIVITY_PREVIEW.banner.buttonWidth,
    height: LIVE_ACTIVITY_PREVIEW.banner.buttonHeight,
    borderRadius: LIVE_ACTIVITY_PREVIEW.banner.buttonHeight / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveStopPillCompact: {
    width: LIVE_ACTIVITY_PREVIEW.expanded.buttonWidth,
    height: LIVE_ACTIVITY_PREVIEW.expanded.buttonHeight,
    borderRadius: LIVE_ACTIVITY_PREVIEW.expanded.buttonHeight / 2,
  },
  liveStopLabel: {
    fontSize: LIVE_ACTIVITY_PREVIEW.banner.buttonTextSize,
    lineHeight: WIDGET_TYPE.md.lineHeight,
    fontWeight: WIDGET_WEIGHT.bold,
  },
  liveStopLabelCompact: {
    fontSize: LIVE_ACTIVITY_PREVIEW.expanded.buttonTextSize,
    lineHeight: WIDGET_TYPE.md.lineHeight,
  },
  liveIslandScroller: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  liveIslandCompact: {
    width: LIVE_ACTIVITY_PREVIEW.compact.width,
    height: LIVE_ACTIVITY_PREVIEW.compact.height,
    borderRadius: LIVE_ACTIVITY_PREVIEW.compact.height / 2,
    paddingHorizontal: LIVE_ACTIVITY_PREVIEW.compact.paddingHorizontal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    gap: LIVE_ACTIVITY_PREVIEW.expanded.gap,
  },
  liveCompactLeadingText: {
    fontSize: LIVE_ACTIVITY_PREVIEW.compact.fontSize,
    lineHeight: WIDGET_TYPE.md.lineHeight,
    fontWeight: WIDGET_WEIGHT.bold,
  },
  liveCompactTrailingText: {
    width: LIVE_ACTIVITY_PREVIEW.compact.timerWidth,
    fontSize: LIVE_ACTIVITY_PREVIEW.compact.fontSize,
    lineHeight: WIDGET_TYPE.md.lineHeight,
    fontWeight: WIDGET_WEIGHT.bold,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  liveIslandMinimal: {
    width: LIVE_ACTIVITY_PREVIEW.minimal.size,
    height: LIVE_ACTIVITY_PREVIEW.minimal.size,
    borderRadius: LIVE_ACTIVITY_PREVIEW.minimal.size / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  liveMinimalText: {
    fontSize: LIVE_ACTIVITY_MINIMAL.fontSize,
    lineHeight: WIDGET_TYPE.md.lineHeight,
    fontWeight: WIDGET_WEIGHT.bold,
  },
  liveIslandExpanded: {
    width: LIVE_ACTIVITY_PREVIEW.expanded.width,
    height: LIVE_ACTIVITY_PREVIEW.expanded.height,
    borderRadius: LIVE_ACTIVITY_PREVIEW.expanded.height / 2,
    paddingHorizontal: LIVE_ACTIVITY_PREVIEW.expanded.horizontalPadding,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  liveIslandExpandedRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: LIVE_ACTIVITY_PREVIEW.expanded.gap,
  },
  liveExpandedTitle: {
    width: LIVE_ACTIVITY_PREVIEW.expanded.titleWidth,
    fontSize: LIVE_ACTIVITY_EXPANDED.titleFontSize,
    lineHeight: WIDGET_TYPE.lg.lineHeight,
    fontWeight: WIDGET_WEIGHT.bold,
  },
  liveIslandExpandedCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  liveExpandedTimer: {
    width: '100%',
    fontSize: LIVE_ACTIVITY_EXPANDED.timerFontSize,
    lineHeight: LIVE_ACTIVITY_PREVIEW.expanded.timerLineHeight,
    fontWeight: WIDGET_WEIGHT.bold,
    fontVariant: ['tabular-nums'],
    textAlign: LIVE_ACTIVITY_EXPANDED.timerHorizontalAlignment === 'trailing' ? 'right' : 'center',
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
    flex: 1,
    minWidth: 0,
  },
  smallSquareSingle: {
    minWidth: 0,
    width: '48%',
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
  },
  tinyLabel: {
    fontSize: WIDGET_PREVIEW_SPEC.text.label.size,
    lineHeight: WIDGET_PREVIEW_SPEC.text.label.lineHeight,
    fontWeight: WIDGET_PREVIEW_SPEC.text.label.weight,
    letterSpacing: 0,
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
