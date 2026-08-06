import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { makeColors } from '@/src/theme/tokens';

import {
  buildHeatmapWidgetProps,
  buildHeatmapWidgetRows,
  parseHeatmapWidgetList,
} from './heatmap-widget-model';
import { WIDGET_RENDERER_CONTRACT_FINGERPRINT } from './generated/widget-renderer-contract.generated';
import { buildWorkoutLockScreenCalendarFromCells } from './lock-screen-widget-model';
import {
  WIDGET_PREVIEW_SPEC,
  WIDGET_RENDERER_CONTRACT,
  resolveHomeWidgetContentPadding,
  widgetAccessoryPreviewBackdrop,
  widgetPreviewViewports,
} from './widget-spec';

describe('widget renderer contract', () => {
  it('keeps the widget design system intentionally minimal', () => {
    const design = WIDGET_RENDERER_CONTRACT.designSystem;

    expect(design.typography).toEqual({
      sm: { size: 8, lineHeight: 10 },
      md: { size: 12, lineHeight: 16 },
      lg: { size: 16, lineHeight: 21 },
      xl: { size: 26, lineHeight: 31 },
    });
    expect(design.fontWeight).toEqual({ bold: '800', medium: '700', light: '600' });
    expect(design.spacing).toEqual({ xs: 2, sm: 4, md: 8, lg: 12 });
    expect(design.radius).toEqual({ cell: 3, control: 12, container: 24 });
    expect(Object.keys(design.colorRoles)).toEqual([
      'surface',
      'raisedSurface',
      'textHigh',
      'textMedium',
      'textLow',
      'textWeekend',
      'todayIndicator',
      'accent',
      'onAccent',
      'heatmapBase',
      'heatmapEmpty',
    ]);
  });

  it('resolves shared design tokens into platform recipes', () => {
    const source = JSON.parse(
      fs.readFileSync('src/widgets/widget-renderer-contract.json', 'utf8')
    );

    expect(source.card.contentPadding).toBe('{contentPadding}');
    expect(source.contentMargins).toEqual({
      home: {
        mode: 'proportionalToShortestEdge',
        referenceShortestEdge: 158,
      },
      accessory: { mode: 'systemManaged' },
    });
    expect(source.control.verticalDistribution).toBe('spaceBetween');
    expect(source.control).not.toHaveProperty('headerHeight');
    expect(source.control).not.toHaveProperty('bodyHeight');
    expect(source.control).not.toHaveProperty('footerWithRangeHeight');
    expect(source.routineProgress).not.toHaveProperty('indicator');
    expect(source.routineProgress).not.toHaveProperty('text');
    expect(source.routineProgress.textList).toMatchObject({
      availability: 'native',
      kindAccessor: 'routineProgress',
      family: 'systemSmall',
      orientation: 'vertical',
      progressBasis: 'nextSplitPosition',
      verticalDistribution: 'adaptiveByVisibleItemCount',
      visibleItemLimit: 4,
      layoutByVisibleItemCount: {
        '1': { verticalDistribution: 'center' },
        '2': { verticalDistribution: 'centeredGroup', itemGap: '{spacing.lg}' },
        '3': { verticalDistribution: 'spaceBetween', density: 'default' },
        '4': {
          verticalDistribution: 'spaceBetween',
          density: 'compact',
          verticalContentPadding: '{spacing.md}',
        },
      },
    });
    expect(source.routineProgress.textList.lockScreen).toMatchObject({
      availability: 'native',
      kindAccessor: 'lockScreenRoutineProgress',
      family: 'accessoryRectangular',
      orientation: 'horizontal',
      visibleItemLimit: 3,
      visibleItemSelection: 'currentCentered',
      progressBasis: 'nextSplitPosition',
      horizontalAlignment: 'center',
      rowContent: ['workoutAliasOrBodyParts', 'relativeDay'],
    });
    expect(source.lockScreen.threeWeekCalendar).toMatchObject({
      availability: 'native',
      kindAccessor: 'lockScreenThreeWeekCalendar',
      family: 'accessoryRectangular',
      rangeWeeks: 3,
      calendarAlignment: 'completeCalendarWeeks',
      columns: 7,
      dimmedWeekdayLabels: ['일', '토'],
      dimmedWeekdayOpacity: '{opacity.muted}',
      emptyCellFill: 'transparent',
      todayIndicator: {
        style: 'border',
        color: '#FFFFFF',
        width: 1,
      },
    });
    expect(
      WIDGET_RENDERER_CONTRACT.lockScreen.threeWeekCalendar.dimmedWeekdayOpacity
    ).toBe(0.72);
    expect(source.lockScreen.nextThreeWeekCalendar).toMatchObject({
      availability: 'native',
      kindAccessor: 'lockScreenNextThreeWeekCalendar',
      family: 'accessoryRectangular',
      rangeWeeks: 3,
      calendarAlignment: 'upcomingCompleteCalendarWeeks',
      columns: 7,
      sharedStyle: 'threeWeekCalendar',
    });
    expect(source.bodyPartDuration).toMatchObject({
      availability: 'native',
      kindAccessor: 'bodyPartDuration',
      family: 'systemSmall',
      rangeDays: 30,
      durationAttribution: 'fullSessionPerBodyPart',
      sort: 'durationDescending',
      visibleItemLimit: 4,
    });
    expect(source.heatmap.styles.detailed.cellGap).toBe('{spacing.sm}');
    expect(source.heatmap.variants.week.style).toBe('detailed');
    expect(source.heatmap.variants.month.style).toBe('detailed');
    expect(source.heatmap.variants.year.style).toBe('compact');
    expect(source.heatmap.previewVariants.currentMonth).toMatchObject({
      style: 'detailed',
      availability: 'native',
      kindAccessor: 'currentMonthCalendar',
      family: 'systemSmall',
      headerVisible: true,
      headerSummary: 'count',
      headerOpacity: '{opacity.muted}',
      maxRows: 6,
      denseRowThreshold: 6,
      denseVerticalGap: '{spacing.xs}',
      denseHeaderGap: '{spacing.sm}',
      denseWeekdayHeaderHeight: '{typography.sm.lineHeight}',
      outsideMonthCells: 'dateLabelOnly',
      todayIndicator: {
        style: 'border',
        colorRole: 'todayIndicator',
        width: 1.5,
      },
    });
    expect(
      WIDGET_RENDERER_CONTRACT.heatmap.previewVariants.currentMonth.todayIndicator
    ).toEqual({
      style: 'border',
      colorRole: 'todayIndicator',
      width: 1.5,
    });
    expect(
      WIDGET_RENDERER_CONTRACT.heatmap.previewVariants.currentMonth.headerSummary
    ).toBe('count');
    expect(WIDGET_RENDERER_CONTRACT.heatmap.previewVariants.fourWeekExpanded).toMatchObject({
      aspectRatio: 2.14,
      family: 'systemMedium',
      rangeWeeks: 4,
      weekdayHeaderHeight: WIDGET_RENDERER_CONTRACT.designSystem.typography.sm.lineHeight,
    });
    expect(WIDGET_RENDERER_CONTRACT.heatmap.weekdayLabelHeightInCells).toBe(1);
    expect(WIDGET_RENDERER_CONTRACT.card.contentPadding).toBe(
      WIDGET_RENDERER_CONTRACT.designSystem.contentPadding
    );
    expect(WIDGET_RENDERER_CONTRACT.heatmap.variants.week.cellGap).toBe(
      WIDGET_RENDERER_CONTRACT.designSystem.spacing.sm
    );
  });

  it('freezes the iOS visual baseline while Android uses launcher-native sizing', () => {
    expect(WIDGET_RENDERER_CONTRACT.platformPolicy).toMatchObject({
      sharedSemantics: [
        'function',
        'content',
        'informationPriority',
        'statePolicy',
        'dataPolicy',
        'interactionPolicy',
      ],
      visualParity: 'platformNative',
      ios: {
        visualBaseline: 'frozen',
        renderer: 'swiftUIWidgetKit',
        sizing: 'widgetKitFamilies',
      },
      android: {
        visualBaseline: 'editable',
        renderer: 'bitmapAndRemoteViews',
        sizing: 'launcherExactSizes',
      },
    });
    expect(widgetPreviewViewports('ios')).toBe(
      WIDGET_RENDERER_CONTRACT.previewViewports
    );
    expect(widgetPreviewViewports('android')).toBe(
      WIDGET_RENDERER_CONTRACT.platformPolicy.android.previewViewports
    );
    expect(widgetPreviewViewports('android').homeSmall).toEqual({
      width: 164,
      height: 188,
    });
    expect(
      WIDGET_RENDERER_CONTRACT.platformPolicy.android.providerSizing
    ).toEqual({
      homeSmall: {
        minWidth: 110,
        minHeight: 110,
        targetCellWidth: 2,
        targetCellHeight: 2,
      },
      homeMedium: {
        minWidth: 250,
        minHeight: 110,
        targetCellWidth: 4,
        targetCellHeight: 2,
      },
      accessoryRectangular: {
        minWidth: 250,
        minHeight: 40,
        targetCellWidth: 4,
        targetCellHeight: 1,
      },
    });
    expect(widgetAccessoryPreviewBackdrop('android')).toEqual({
      backgroundColor: WIDGET_RENDERER_CONTRACT.previewPalette.dark.surface,
      borderRadius: WIDGET_RENDERER_CONTRACT.designSystem.radius.container,
      mode: 'representativeWallpaper',
    });
    expect(widgetAccessoryPreviewBackdrop('ios')).toBeNull();
  });

  it('generates Android provider footprints from the shared contract', () => {
    const providerDirectory =
      'modules/loofit-workout-core/android/src/main/res/xml';
    const providerFiles = fs
      .readdirSync(providerDirectory)
      .filter(
        (filename) =>
          filename.startsWith('loofit_widget_') &&
          filename.endsWith('_info.xml')
      );

    expect(providerFiles).toHaveLength(12);
    const lockProviders = providerFiles.filter((filename) =>
      filename.startsWith('loofit_widget_lock_')
    );
    expect(lockProviders).toHaveLength(4);
    for (const filename of providerFiles) {
      const provider = fs.readFileSync(
        `${providerDirectory}/${filename}`,
        'utf8'
      );
      expect(provider).toContain(
        'Generated by scripts/generate-widget-renderer-contract.mjs. Do not edit.'
      );
    }
    for (const filename of lockProviders) {
      const provider = fs.readFileSync(
        `${providerDirectory}/${filename}`,
        'utf8'
      );
      expect(provider).toContain('android:minWidth="250dp"');
      expect(provider).toContain('android:minHeight="40dp"');
      expect(provider).toContain('android:targetCellWidth="4"');
      expect(provider).toContain('android:targetCellHeight="1"');
    }
  });

  it('generates the same 12 semantic surface identifiers for iOS and Android', () => {
    const kinds = Object.values(WIDGET_RENDERER_CONTRACT.surfaceKinds);
    expect(kinds).toHaveLength(12);
    expect(new Set(kinds).size).toBe(12);

    const swiftContract = fs.readFileSync(
      'modules/loofit-workout-core/ios/LoofitWidgetLayoutContract.generated.swift',
      'utf8'
    );
    const kotlinContract = fs.readFileSync(
      'modules/loofit-workout-core/android/src/main/java/com/loofit/workoutcore/LoofitWidgetLayoutContract.generated.kt',
      'utf8'
    );
    for (const kind of kinds) {
      expect(swiftContract).toContain(`= "${kind}"`);
      expect(kotlinContract).toContain(`= "${kind}"`);
    }

    const swiftKinds = fs.readFileSync(
      'modules/loofit-workout-core/ios/LoofitWorkoutModels.swift',
      'utf8'
    );
    const kotlinKinds = fs.readFileSync(
      'modules/loofit-workout-core/android/src/main/java/com/loofit/workoutcore/LoofitWorkoutProjection.kt',
      'utf8'
    );
    expect(swiftKinds).toContain('LoofitWidgetLayoutContract.SurfaceKinds');
    expect(kotlinKinds).toContain('LoofitWidgetLayoutContract.SurfaceKinds');
    expect(swiftKinds).not.toContain('public static let control = "WorkoutControlWidget"');
    expect(kotlinKinds).not.toContain('const val CONTROL = "WorkoutControlWidget"');
  });

  it('scales home widget padding from the shortest edge', () => {
    expect(resolveHomeWidgetContentPadding({ height: 158, width: 158 })).toBe(12);
    expect(resolveHomeWidgetContentPadding({ height: 170, width: 364 })).toBeCloseTo(
      (12 * 170) / 158
    );
    expect(resolveHomeWidgetContentPadding({ height: 0, width: 0 })).toBe(12);
  });

  it('keeps the 7-day/5-week/6-month surface policies explicit', () => {
    const { variants } = WIDGET_RENDERER_CONTRACT.heatmap;

    expect(Object.keys(variants)).toEqual(['week', 'month', 'year']);
    expect(variants.week).toMatchObject({
      style: 'detailed',
      rangeDays: 7,
      headerVisible: false,
      headerSummary: 'none',
      calendarAlignment: 'rollingDays',
      family: 'systemSmall',
    });
    expect(variants.month).toMatchObject({
      style: 'detailed',
      title: '지난 5주',
      rangeDays: 0,
      rangeWeeks: 5,
      contentPadding: 12,
      headerVisible: false,
      headerSummary: 'none',
      reservedHeaderHeight: 0,
      reservedFooterHeight: 18,
      calendarAlignment: 'calendarWeeks',
      showLeadingCalendarCells: false,
    });
    expect(variants.year).toMatchObject({
      style: 'compact',
      nativeCase: 'sixMonths',
      rangeMonths: 6,
      headerSummary: 'countTotalAverage',
      calendarAlignment: 'continuousMonthsWithBoundarySlots',
      monthBoundaryGapSlots: 7,
      family: 'systemMedium',
    });
    expect(variants.week).toMatchObject({
      columns: variants.month.columns,
      contentPadding: variants.month.contentPadding,
      cellGap: variants.month.cellGap,
      cellRadius: variants.month.cellRadius,
      cellLabelSize: variants.month.cellLabelSize,
    });
    expect(variants.year.contentPadding).toBe(variants.week.contentPadding);
  });

  it('keeps the 5-week footer as an unlabeled count and total duration summary', () => {
    expect(WIDGET_RENDERER_CONTRACT.heatmap.monthFooter).toEqual({
      statOrder: ['count', 'totalDuration'],
      separator: ' · ',
      totalDurationPrefix: '총 ',
    });
  });

  it('keeps the 7-day footer order and empty recent state stable', () => {
    expect(WIDGET_RENDERER_CONTRACT.heatmap.weekFooter).toMatchObject({
      statOrder: ['count', 'totalDuration', 'averageDuration'],
      statLabels: ['횟수', '총 시간', '평균'],
      recentLabel: '최근 운동',
      emptyRecentLabel: '아직 기록 없음',
      alwaysShowRecent: true,
      statLabelSize: WIDGET_RENDERER_CONTRACT.designSystem.typography.sm.size,
      statValueSize: WIDGET_RENDERER_CONTRACT.designSystem.typography.lg.size,
      statValueMinimumScale: WIDGET_RENDERER_CONTRACT.designSystem.minimumScale.default,
    });

    const props = buildHeatmapWidgetProps({
      variant: 'week',
      cells: dailyCells(new Date(2026, 6, 5), new Date(2026, 6, 11)),
      colors: makeColors('dark', '#CFF56A'),
    });
    expect(props.recentWorkoutLabel).toBe(
      WIDGET_RENDERER_CONTRACT.heatmap.weekFooter.recentLabel
    );
    expect(props.recentWorkoutTitles).toBe('');
  });

  it('uses high-contrast date labels on filled heatmap cells', () => {
    const dark = makeColors('dark', '#CFF56A');
    const light = makeColors('light', '#CFF56A');
    const cells = [0, 1, 2, 3, 4].map((bucket, index) => ({
      bucket: bucket as 0 | 1 | 2 | 3 | 4,
      dateKey: `2026-07-${String(index + 1).padStart(2, '0')}`,
    }));

    const darkProps = buildHeatmapWidgetProps({ variant: 'week', cells, colors: dark });
    const lightProps = buildHeatmapWidgetProps({ variant: 'week', cells, colors: light });

    expect(parseHeatmapWidgetList(darkProps.labelColors)).toEqual([
      dark.tx4,
      dark.tx,
      dark.tx,
      dark.accentText,
      dark.accentText,
    ]);
    expect(parseHeatmapWidgetList(lightProps.labelColors)).toEqual([
      light.tx4,
      light.tx,
      light.tx,
      light.accentText,
      light.accentText,
    ]);
  });

  it('uses the shared red policy for Sunday and Saturday labels', () => {
    const colors = makeColors('dark', '#CFF56A');
    const policy = WIDGET_RENDERER_CONTRACT.heatmap.weekdayLabelColorPolicy;
    const props = buildHeatmapWidgetProps({
      variant: 'month',
      cells: dailyCells(new Date(2026, 6, 5), new Date(2026, 6, 11)),
      colors,
    });

    expect(policy.weekendLabels).toEqual(['일', '토']);
    expect(policy.weekendRole).toBe('textWeekend');
    expect(props.weekendWeekdayLabelColor).toBe(colors.danger);

    const renderer = fs.readFileSync('plugins/native-widgets/LoofitWidgetBundle.swift', 'utf8');
    expect(renderer).toContain('Heatmap.weekendWeekdayLabels.contains(label)');
    expect(renderer).toContain('entry.palette.textWeekend');
  });

  it('keeps the weekday label row as tall as one heatmap cell', () => {
    expect(WIDGET_RENDERER_CONTRACT.heatmap.weekdayLabelHeightInCells).toBe(1);

    const renderer = fs.readFileSync('plugins/native-widgets/LoofitWidgetBundle.swift', 'utf8');
    expect(renderer).toContain('height: cell * LoofitWidgetRendererContract.Heatmap.weekdayLabelHeightInCells');
  });

  it('keeps compact Live Activity content balanced at the system preview size', () => {
    expect(WIDGET_RENDERER_CONTRACT.liveActivity.compact).toEqual({
      leadingWidth: 48,
      trailingWidth: 48,
      fontSize: 12,
      previewWidth: 230,
      previewHeight: 37,
      previewHorizontalPadding: 7,
    });

    const renderer = fs.readFileSync('plugins/native-widgets/LoofitWidgetBundle.swift', 'utf8');
    const preview = fs.readFileSync('app/widgets.tsx', 'utf8');
    expect(renderer).toContain('LiveActivity.Compact.leadingWidth');
    expect(renderer).toContain('LiveActivity.Compact.trailingWidth');
    expect(renderer).toContain('Text(context.state.title.replacingOccurrences');
    expect(renderer).not.toContain('🏋️');
    expect(preview).not.toContain('🏋️');
    expect(renderer).toContain('.multilineTextAlignment(.trailing)');
  });

  it('binds native and RN text fitting, status copy, and heatmap headers to the shared contract', () => {
    const preview = fs.readFileSync('app/widgets.tsx', 'utf8');
    const heatmapPreview = fs.readFileSync(
      'src/widgets/preview/HeatmapWidgetPreview.tsx',
      'utf8'
    );
    const controlRenderer = fs.readFileSync(
      'plugins/native-widgets/WorkoutControlWidget.swift',
      'utf8'
    );
    const lockRenderer = fs.readFileSync(
      'plugins/native-widgets/WorkoutLockScreenWidget.swift',
      'utf8'
    );
    const widgetRenderer = fs.readFileSync(
      'plugins/native-widgets/LoofitWidgetBundle.swift',
      'utf8'
    );
    const androidRenderer = fs.readFileSync(
      'modules/loofit-workout-core/android/src/main/java/com/loofit/workoutcore/LoofitWidgetBitmapRenderer.kt',
      'utf8'
    );
    const androidNotification = fs.readFileSync(
      'modules/loofit-workout-core/android/src/main/java/com/loofit/workoutcore/LoofitWorkoutNotification.kt',
      'utf8'
    );

    expect(preview).toContain('CONTROL.text.timer.minimumScaleFactor');
    expect(preview).toContain('CONTROL.copy.active');
    expect(preview).toContain('CONTROL.copy.end');
    expect(preview).not.toMatch(/minimumFontScale=\{0\./);
    expect(heatmapPreview).toContain('rendererSpec.headerLineHeight');
    expect(heatmapPreview).toContain('rendererSpec.cellLabelMinimumScaleFactor');
    expect(controlRenderer).toContain('Control.timerMinimumScaleFactor');
    expect(lockRenderer).toContain('LockScreen.circularMinimumScaleFactor');
    expect(widgetRenderer).toContain('rendererSpec.headerMinimumScaleFactor');
    expect(widgetRenderer).toContain('rendererSpec.cellLabelMinimumScaleFactor');
    expect(widgetRenderer).toContain('Control.Copy.active');
    expect(widgetRenderer).toContain('Control.Copy.end');
    expect([controlRenderer, lockRenderer, widgetRenderer].join('\n')).not.toMatch(
      /minimumScaleFactor\(0\./
    );
    expect(androidRenderer).toContain('spec.headerLineHeight');
    expect(androidRenderer).toContain('spec.cellLabelMinimumScaleFactor');
    expect(androidNotification).toContain('Control.Copy.active');
    expect(androidNotification).toContain('Control.Copy.end');
  });

  it('centers the active timer in the rectangular lock screen workout widget', () => {
    const renderer = fs.readFileSync('plugins/native-widgets/WorkoutLockScreenWidget.swift', 'utf8');
    expect(renderer).toContain('.multilineTextAlignment(.center)');
    expect(renderer).toContain('.frame(maxWidth: .infinity, alignment: .center)');
  });

  it('places expanded Live Activity content around the TrueDepth camera', () => {
    expect(WIDGET_RENDERER_CONTRACT.liveActivity.expanded.regions).toEqual({
      title: 'leading',
      timer: 'center',
      endButton: 'trailing',
    });
    expect(WIDGET_RENDERER_CONTRACT.liveActivity.expanded).toMatchObject({
      sideRegionVerticalAlignment: 'center',
      timerHorizontalAlignment: 'trailing',
      timerRegionPriority: 1,
      timerFontSize: 26,
      timerLineHeight: 31,
    });

    const renderer = fs.readFileSync('plugins/native-widgets/LoofitWidgetBundle.swift', 'utf8');
    expect(renderer).toContain('LiveActivity.Expanded.titleRegion');
    expect(renderer).toContain('LiveActivity.Expanded.timerRegion');
    expect(renderer).toContain('LiveActivity.Expanded.endButtonRegion');
    expect(renderer).toContain('LiveActivity.Expanded.timerAlignment');
  });

  it('derives preview layout values from the canonical contract', () => {
    expect(WIDGET_PREVIEW_SPEC.card.padding).toBe(
      WIDGET_RENDERER_CONTRACT.card.contentPadding
    );
    expect(WIDGET_PREVIEW_SPEC.heatmap.week.cellGap).toBe(
      WIDGET_RENDERER_CONTRACT.heatmap.variants.week.cellGap
    );
    expect(WIDGET_PREVIEW_SPEC.heatmap.month.cellRadius).toBe(
      WIDGET_RENDERER_CONTRACT.heatmap.variants.month.cellRadius
    );
    expect(WIDGET_PREVIEW_SPEC.heatmap.month.contentPadding).toBe(
      WIDGET_RENDERER_CONTRACT.heatmap.variants.month.contentPadding
    );
    expect(WIDGET_PREVIEW_SPEC.heatmap.year.months).toBe(
      WIDGET_RENDERER_CONTRACT.heatmap.variants.year.rangeMonths
    );
  });

  it('labels a rolling 7-day grid from its actual first weekday', () => {
    const props = buildHeatmapWidgetProps({
      variant: 'week',
      // 2026-07-06 is Monday; rolling weeks must not pretend this is Sunday.
      cells: dailyCells(new Date(2026, 6, 6), new Date(2026, 6, 12)),
      colors: makeColors('dark', '#CFF56A'),
    });

    expect(props.weekdayLabels).toBe('월,화,수,목,금,토,일');
  });

  it('pads every in-progress five-week window to exactly five rows', () => {
    for (let dayCount = 29; dayCount <= 35; dayCount += 1) {
      const props = buildHeatmapWidgetProps({
        variant: 'month',
        cells: dailyCells(new Date(2026, 5, 14), new Date(2026, 5, 13 + dayCount)),
        colors: makeColors('dark', '#CFF56A'),
      });

      const rows = buildHeatmapWidgetRows(props, 'month');
      expect(rows).toHaveLength(5);
      expect(rows.every((row) => row.length === 7)).toBe(true);
    }
  });

  it('materializes one seven-slot gap at every six-month boundary', () => {
    const cells = dailyCells(new Date(2026, 1, 1), new Date(2026, 6, 11));
    const props = buildHeatmapWidgetProps({
      variant: 'year',
      cells,
      colors: makeColors('dark', '#CFF56A'),
    });
    const monthLabels = parseHeatmapWidgetList(props.monthLabels).filter(Boolean);
    const renderedCells = parseHeatmapWidgetList(props.colors);

    expect(props).not.toHaveProperty('monthGapBeforeWeeks');
    expect(props).not.toHaveProperty('monthGapColumns');
    expect(monthLabels).toEqual(['2월', '3월', '4월', '5월', '6월', '7월']);
    expect(renderedCells).toHaveLength(
      cells.length +
        (WIDGET_RENDERER_CONTRACT.heatmap.variants.year.rangeMonths - 1) *
          WIDGET_RENDERER_CONTRACT.heatmap.variants.year.monthBoundaryGapSlots
    );
  });

  it('builds a three-week lock-screen calendar with dates and four heat levels', () => {
    const cells = dailyCells(new Date(2026, 5, 28), new Date(2026, 6, 18)).map(
      (cell, index) => ({ ...cell, bucket: (index % 5) as 0 | 1 | 2 | 3 | 4 })
    );
    const calendar = buildWorkoutLockScreenCalendarFromCells({
      cells,
      todayDateKey: '2026-07-15',
    });

    expect(calendar.weekdayLabels).toBe('일,월,화,수,목,금,토');
    expect(calendar.dateLabels.split(',')).toHaveLength(21);
    expect(calendar.dateLabels.split(',').at(0)).toBe('28');
    expect(calendar.dateLabels.split(',').at(-1)).toBe('18');
    expect(calendar.heatLevels.split(',')).toHaveLength(21);
    expect(calendar.todayFlags.split(',')).toHaveLength(21);
    expect(calendar.todayFlags.split(',').filter((flag) => flag === '1')).toHaveLength(1);
    expect(calendar).not.toHaveProperty('weekendColor');

    const renderer = fs.readFileSync(
      'plugins/native-widgets/ThreeWeekCalendarLockScreenWidget.swift',
      'utf8'
    );
    expect(renderer).toContain('ThreeWeekCalendar.dimmedWeekdayLabels.contains(label)');
    expect(renderer).toContain('primaryColor.opacity(opacity)');
    expect(renderer).toContain('guard level > 0 else { return .clear }');
    expect(renderer).toContain('LoofitColor(spec.todayIndicatorColor)');
    expect(renderer).not.toContain('textWeekend');
    expect(renderer).not.toContain('LoofitHeatmapFillColor');
    expect(renderer).not.toContain('entry.palette');
    expect(renderer).not.toContain('Color(white:');
  });

  it('links the generated Swift contract into the Widget Extension target', () => {
    const plugin = fs.readFileSync('plugins/with-loofit-heatmap-widgets.js', 'utf8');

    expect(plugin).toContain("const RENDERER_CONTRACT_FILE = 'LoofitWidgetRendererContract.generated.swift'");
    expect(plugin).toContain("const SHARED_RENDERER_FILE = 'LoofitWidgetShared.swift'");
    expect(plugin).toContain('includeWidgetSource(project, RENDERER_CONTRACT_FILE)');
    expect(plugin).toContain('includeWidgetSource(project, SHARED_RENDERER_FILE)');
    expect(plugin).toContain('IOSConfig.XcodeUtils.addBuildSourceFileToGroup');
    expect(plugin).toContain("readNativeSource('WidgetBundleEntry.swift')");
    expect(plugin).toContain("readNativeSource('LoofitWidgetBundle.swift')");
    expect(plugin).toContain("readNativeSource('ThreeWeekCalendarLockScreenWidget.swift')");
    expect(plugin).toContain("readNativeSource('NextThreeWeekCalendarLockScreenWidget.swift')");
  });

  it('removes the legacy seven-day lock-screen summary surface', () => {
    const appConfig = fs.readFileSync('app.config.js', 'utf8');
    const plugin = fs.readFileSync('plugins/with-loofit-heatmap-widgets.js', 'utf8');
    const bundle = fs.readFileSync('plugins/native-widgets/LoofitWidgetBundle.swift', 'utf8');
    const coreModels = fs.readFileSync(
      'modules/loofit-workout-core/ios/LoofitWorkoutModels.swift',
      'utf8'
    );

    for (const source of [appConfig, bundle, coreModels]) {
      expect(source).not.toContain('WorkoutLockScreenSummaryWidget');
    }
    expect(plugin).toContain('removeLegacyWidgetSource');
    expect(WIDGET_RENDERER_CONTRACT.lockScreen).not.toHaveProperty('summary');
    expect(WIDGET_RENDERER_CONTRACT.lockScreen).not.toHaveProperty('summaryDays');
  });

  it('uses one description format across heatmap widgets', () => {
    const appConfig = fs.readFileSync('app.config.js', 'utf8');
    const plugin = fs.readFileSync('plugins/with-loofit-heatmap-widgets.js', 'utf8');
    const nativeDescriptions = [
      'CurrentMonthCalendarWidget.swift',
      'HeatmapFourWeekExpandedWidget.swift',
      'ThreeWeekCalendarLockScreenWidget.swift',
      'NextThreeWeekCalendarLockScreenWidget.swift',
    ]
      .map((filename) => fs.readFileSync(`plugins/native-widgets/${filename}`, 'utf8'))
      .join('\n');

    for (const source of [appConfig, plugin, nativeDescriptions]) {
      expect(source).not.toContain('달력으로 확인합니다.');
    }

    const descriptions = [
      '지난 7일의 운동 기록과 요약을 히트맵으로 확인합니다.',
      '이번 주를 포함한 지난 5주의 운동 기록을 히트맵으로 확인합니다.',
      '지난 6개월의 운동 기록을 히트맵으로 확인합니다.',
      '이번 달 운동 기록을 히트맵으로 확인합니다.',
      '지난 4주의 운동 날짜와 부위를 히트맵으로 확인합니다.',
      '지난 3주의 운동 기록을 히트맵으로 확인합니다.',
      '이번 주와 다음 2주의 운동 기록을 히트맵으로 확인합니다.',
    ];
    for (const description of descriptions) {
      expect(appConfig).toContain(description);
    }

    const displayNames = [
      '히트맵 · 지난 7일',
      '히트맵 · 지난 5주',
      '히트맵 · 지난 6개월',
      '히트맵 · 이번 달',
      '히트맵 · 지난 4주 상세',
      '잠금화면 히트맵 · 지난 3주',
      '잠금화면 히트맵 · 다음 3주',
    ];
    for (const displayName of displayNames) {
      expect(appConfig).toContain(displayName);
    }
  });

  it('keeps native iOS surfaces Korean-localized while the launch is Korea-only', () => {
    const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8'));
    const plugin = fs.readFileSync('plugins/with-loofit-heatmap-widgets.js', 'utf8');
    const lockScreen = fs.readFileSync(
      'plugins/native-widgets/WorkoutLockScreenWidget.swift',
      'utf8'
    );
    const control = fs.readFileSync(
      'plugins/native-widgets/WorkoutControlWidget.swift',
      'utf8'
    );
    const bundle = fs.readFileSync('plugins/native-widgets/LoofitWidgetBundle.swift', 'utf8');
    const appOnlyVerifier = fs.readFileSync(
      'scripts/verify-app-only-ios-project.sh',
      'utf8'
    );

    expect(appConfig.expo.ios.infoPlist).toMatchObject({
      CFBundleDevelopmentRegion: 'ko',
      CFBundleLocalizations: ['ko'],
    });
    expect(plugin).toContain("const KOREAN_LANGUAGE_CODE = 'ko'");
    expect(plugin).toContain('configureKoreanProjectLocalization(project)');
    expect(plugin).toContain('configureWidgetInfoPlist(widgetInfoPlistPath)');
    expect(bundle).toContain('static let koreanLocale = Locale(identifier: "ko_KR")');
    expect(lockScreen).toContain('.environment(\\.locale, LoofitFormat.koreanLocale)');
    expect(control).toContain('.environment(\\.locale, LoofitFormat.koreanLocale)');
    expect(bundle).toContain('.environment(\\.locale, LoofitFormat.koreanLocale)');
    expect(appOnlyVerifier).toContain('CFBundleDevelopmentRegion=$NATIVE_LANGUAGE');
    expect(appOnlyVerifier).toContain('CFBundleLocalizations');
    expect(appOnlyVerifier).toContain('developmentRegion = $NATIVE_LANGUAGE;');
  });

  it('projects semantic policies to both Swift boundaries and consumes them natively', () => {
    const extensionContract = fs.readFileSync(
      'plugins/native-widgets/LoofitWidgetRendererContract.generated.swift',
      'utf8'
    );
    const coreContract = fs.readFileSync(
      'modules/loofit-workout-core/ios/LoofitWidgetLayoutContract.generated.swift',
      'utf8'
    );
    const renderer = fs.readFileSync(
      'plugins/native-widgets/LoofitWidgetBundle.swift',
      'utf8'
    );

    expect(extensionContract).toContain('let headerSummary: LoofitHeatmapHeaderSummary');
    expect(extensionContract).toContain('let calendarAlignment: LoofitHeatmapCalendarAlignment');
    expect(extensionContract).toContain(
      'static let statOrder: [LoofitHeatmapStat] = [.count, .totalDuration, .averageDuration]'
    );
    expect(extensionContract).toContain('static let alwaysShowRecent = true');
    expect(extensionContract).toContain(
      'static let filledCellLabelColorRole: LoofitHeatmapCellLabelColorRole = .textHigh'
    );
    expect(extensionContract).toContain('strongCellLabelMinimumDurationSeconds = 3600');
    expect(coreContract).toContain('weekHeaderSummary: HeaderSummary = .none');
    expect(coreContract).toContain(
      'monthCalendarAlignment: CalendarAlignment = .calendarWeeks'
    );
    expect(coreContract).toContain('monthRangeWeeks = 5');
    expect(coreContract).toContain(
      'weekStatOrder: [HeatmapStat] = [.count, .totalDuration, .averageDuration]'
    );
    expect(coreContract).toContain('weekAlwaysShowsRecent = true');
    expect(coreContract).toContain('threeWeekCalendarRangeWeeks = 3');
    expect(renderer).toContain('switch rendererSpec.headerSummary');
    expect(renderer).toContain('switch rendererSpec.calendarAlignment');
    expect(renderer).toContain('WeekFooter.statOrder');
    expect(renderer).toContain('WeekFooter.alwaysShowRecent');
    expect(renderer).toContain('.foregroundStyle(labelColor(for: day))');
    expect(renderer).toContain('return LoofitColor(palette.tx)');
  });

  it('embeds one contract fingerprint in every generated platform boundary', () => {
    expect(WIDGET_RENDERER_CONTRACT_FINGERPRINT).toMatch(/^[0-9a-f]{64}$/);

    const generatedSources = [
      'plugins/native-widgets/LoofitWidgetRendererContract.generated.swift',
      'modules/loofit-workout-core/ios/LoofitWidgetLayoutContract.generated.swift',
      'modules/loofit-workout-core/android/src/main/java/com/loofit/workoutcore/LoofitWidgetLayoutContract.generated.kt',
    ].map((filename) => fs.readFileSync(filename, 'utf8'));

    for (const source of generatedSources) {
      expect(source).toContain(WIDGET_RENDERER_CONTRACT_FINGERPRINT);
    }
  });

  it('generates all Android picker previews from the shared fixture and tokens', () => {
    const previewDirectory = 'modules/loofit-workout-core/android/src/main/res/layout';
    const previewFiles = fs
      .readdirSync(previewDirectory)
      .filter((filename) => filename.startsWith('loofit_widget_preview_'));

    expect(previewFiles).toHaveLength(12);
    const previews = previewFiles.map((filename) =>
      fs.readFileSync(`${previewDirectory}/${filename}`, 'utf8')
    );
    for (const preview of previews) {
      expect(preview).toContain(
        'Generated by scripts/generate-widget-renderer-contract.mjs. Do not edit.'
      );
      expect(preview).not.toMatch(/[●○]/);
      expect(preview).not.toContain('루핏 ·');
      expect(preview).not.toMatch(/<(View|Space)\b/);
    }

    const control = fs.readFileSync(
      `${previewDirectory}/loofit_widget_preview_control.xml`,
      'utf8'
    );
    expect(control).toContain(WIDGET_RENDERER_CONTRACT.previewFixture.control.idle.title);
    expect(control).toContain(
      `android:layout_height="${WIDGET_RENDERER_CONTRACT.control.buttonHeight}dp"`
    );

    const routine = fs.readFileSync(
      `${previewDirectory}/loofit_widget_preview_routine_progress.xml`,
      'utf8'
    );
    expect(routine.match(/@style\/LoofitWidgetPreviewRoutineTitle/g)).toHaveLength(
      WIDGET_RENDERER_CONTRACT.routineProgress.textList.visibleItemLimit
    );
    expect(routine).not.toMatch(/[●○]/);

    const lockRoutine = fs.readFileSync(
      `${previewDirectory}/loofit_widget_preview_lock_routine_progress.xml`,
      'utf8'
    );
    expect(lockRoutine.match(/@style\/LoofitWidgetPreviewLockWorkout/g)).toHaveLength(
      WIDGET_RENDERER_CONTRACT.routineProgress.textList.lockScreen.visibleItemLimit
    );

    const background = fs.readFileSync(
      'modules/loofit-workout-core/android/src/main/res/drawable/loofit_widget_background.xml',
      'utf8'
    );
    expect(background).toContain(
      `android:radius="${WIDGET_RENDERER_CONTRACT.designSystem.radius.container}dp"`
    );

    const lightColors = fs.readFileSync(
      'modules/loofit-workout-core/android/src/main/res/values/colors.xml',
      'utf8'
    );
    const darkColors = fs.readFileSync(
      'modules/loofit-workout-core/android/src/main/res/values-night/colors.xml',
      'utf8'
    );
    expect(lightColors).toContain(WIDGET_RENDERER_CONTRACT.previewPalette.light.surface);
    expect(darkColors).toContain(WIDGET_RENDERER_CONTRACT.previewPalette.dark.surface);

    for (const filename of [
      'loofit_widget_preview_lock_workout.xml',
      'loofit_widget_preview_lock_three_week.xml',
      'loofit_widget_preview_lock_next_three_week.xml',
      'loofit_widget_preview_lock_routine_progress.xml',
    ]) {
      expect(fs.readFileSync(`${previewDirectory}/${filename}`, 'utf8')).toContain(
        'android:background="@drawable/loofit_widget_background"'
      );
    }
  });

  it('routes every Android widget through the shared render plan', () => {
    const androidSourceRoot =
      'modules/loofit-workout-core/android/src/main/java/com/loofit/workoutcore';
    const publisher = fs.readFileSync(`${androidSourceRoot}/LoofitAndroidWidgets.kt`, 'utf8');
    const renderer = fs.readFileSync(`${androidSourceRoot}/LoofitWidgetBitmapRenderer.kt`, 'utf8');

    expect(publisher).toContain('LoofitWidgetRenderPlanBuilder.build');
    expect(publisher).toContain('LoofitWidgetBitmapRenderer.render');
    expect(renderer).toContain('LoofitWidgetLayoutContract.Heatmap.bucketThresholdSeconds');
    expect(renderer).toContain('LoofitWidgetLayoutContract.Heatmap.bucketAccentWeights');
    expect(fs.existsSync(`${androidSourceRoot}/LoofitHeatmapBitmapRenderer.kt`)).toBe(false);
    expect(fs.existsSync(`${androidSourceRoot}/LoofitDurationBitmapRenderer.kt`)).toBe(false);
    expect(
      fs.existsSync(
        'modules/loofit-workout-core/android/src/main/res/layout/loofit_widget.xml'
      )
    ).toBe(false);
    expect(
      fs.existsSync(
        'modules/loofit-workout-core/android/src/main/res/layout/loofit_widget_lock.xml'
      )
    ).toBe(false);
  });

  it('verifies the App Group identifier in both generated Info.plists', () => {
    const verifier = fs.readFileSync('scripts/verify-widget-extension-isolation.sh', 'utf8');

    expect(verifier).toContain('WIDGET_INFO_PLIST="ios/ExpoWidgetsTarget/Info.plist"');
    expect(verifier).toContain("Print :ExpoWidgetsAppGroupIdentifier");
    expect(verifier).toContain('for PLIST in "$INFO_PLIST" "$WIDGET_INFO_PLIST"');
  });
});

function dailyCells(start: Date, end: Date) {
  const result: Array<{ dateKey: string; bucket: 0; inRange: true }> = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    result.push({
      dateKey: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
        cursor.getDate()
      ).padStart(2, '0')}`,
      bucket: 0,
      inRange: true,
    });
  }
  return result;
}
