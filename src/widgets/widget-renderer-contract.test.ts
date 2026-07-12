import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { makeColors } from '@/src/theme/tokens';

import { buildHeatmapWidgetProps, parseHeatmapWidgetList } from './heatmap-widget-model';
import { buildWorkoutLockScreenSummaryFromCells } from './lock-screen-widget-model';
import { WIDGET_PREVIEW_SPEC, WIDGET_RENDERER_CONTRACT } from './widget-spec';

describe('widget renderer contract', () => {
  it('keeps the 7/30/6-month surface policies explicit', () => {
    const { variants } = WIDGET_RENDERER_CONTRACT.heatmap;

    expect(Object.keys(variants)).toEqual(['week', 'month', 'year']);
    expect(variants.week).toMatchObject({
      rangeDays: 7,
      headerVisible: false,
      headerSummary: 'none',
      calendarAlignment: 'rollingDays',
      family: 'systemSmall',
    });
    expect(variants.month).toMatchObject({
      rangeDays: 30,
      headerSummary: 'count',
      calendarAlignment: 'weekContainingRangeStart',
      showLeadingCalendarCells: true,
    });
    expect(variants.year).toMatchObject({
      nativeCase: 'sixMonths',
      rangeMonths: 6,
      headerSummary: 'countTotalAverage',
      calendarAlignment: 'continuousMonthsWithBoundarySlots',
      monthBoundaryGapSlots: 7,
      family: 'systemMedium',
    });
  });

  it('keeps the 7-day footer order and empty recent state stable', () => {
    expect(WIDGET_RENDERER_CONTRACT.heatmap.weekFooter).toMatchObject({
      statOrder: ['count', 'totalDuration', 'averageDuration'],
      statLabels: ['횟수', '총 시간', '평균'],
      recentLabel: '최근 운동',
      emptyRecentLabel: '아직 기록 없음',
      alwaysShowRecent: true,
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

  it('materializes one seven-slot gap at every six-month boundary', () => {
    const cells = dailyCells(new Date(2026, 1, 1), new Date(2026, 6, 11));
    const props = buildHeatmapWidgetProps({
      variant: 'year',
      cells,
      colors: makeColors('dark', '#CFF56A'),
    });
    const monthLabels = parseHeatmapWidgetList(props.monthLabels).filter(Boolean);
    const renderedCells = parseHeatmapWidgetList(props.colors);

    expect(monthLabels).toEqual(['2월', '3월', '4월', '5월', '6월', '7월']);
    expect(renderedCells).toHaveLength(
      cells.length +
        (WIDGET_RENDERER_CONTRACT.heatmap.variants.year.rangeMonths - 1) *
          WIDGET_RENDERER_CONTRACT.heatmap.variants.year.monthBoundaryGapSlots
    );
  });

  it('keeps the lock-screen summary at seven cells with zero data', () => {
    const summary = buildWorkoutLockScreenSummaryFromCells({
      cells: [],
      colors: makeColors('dark', '#CFF56A'),
      durationSeconds: 0,
      workoutCount: 0,
    });

    expect(summary.title).toBe(WIDGET_RENDERER_CONTRACT.lockScreen.copy.summaryTitle);
    expect(summary.streakFlags.split(',')).toHaveLength(
      WIDGET_RENDERER_CONTRACT.lockScreen.summaryDays
    );
    expect(summary.summaryText).toBe('0회 · 총 0분');
  });

  it('links the generated Swift contract into the Widget Extension target', () => {
    const plugin = fs.readFileSync('plugins/with-loofit-heatmap-widgets.js', 'utf8');

    expect(plugin).toContain("const RENDERER_CONTRACT_FILE = 'LoofitWidgetRendererContract.generated.swift'");
    expect(plugin).toContain('includeGeneratedRendererContract(project)');
    expect(plugin).toContain('IOSConfig.XcodeUtils.addBuildSourceFileToGroup');
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
    expect(coreContract).toContain('weekHeaderSummary: HeaderSummary = .none');
    expect(coreContract).toContain(
      'monthCalendarAlignment: CalendarAlignment = .weekContainingRangeStart'
    );
    expect(coreContract).toContain(
      'weekStatOrder: [HeatmapStat] = [.count, .totalDuration, .averageDuration]'
    );
    expect(coreContract).toContain('weekAlwaysShowsRecent = true');
    expect(renderer).toContain('switch rendererSpec.headerSummary');
    expect(renderer).toContain('switch rendererSpec.calendarAlignment');
    expect(renderer).toContain('WeekFooter.statOrder');
    expect(renderer).toContain('WeekFooter.alwaysShowRecent');
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
