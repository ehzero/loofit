#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src/widgets/widget-renderer-contract.json');
const typescriptPath = path.join(
  root,
  'src/widgets/generated/widget-renderer-contract.generated.ts'
);
const swiftPath = path.join(
  root,
  'plugins/native-widgets/LoofitWidgetRendererContract.generated.swift'
);
const coreSwiftPath = path.join(
  root,
  'modules/loofit-workout-core/ios/LoofitWidgetLayoutContract.generated.swift'
);

const contract = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
validate(contract);

const outputs = new Map([
  [typescriptPath, renderTypeScript(contract)],
  [swiftPath, renderSwift(contract)],
  [coreSwiftPath, renderCoreSwift(contract)],
]);

if (process.argv.includes('--check')) {
  const stale = [...outputs].filter(
    ([targetPath, expected]) =>
      !fs.existsSync(targetPath) || fs.readFileSync(targetPath, 'utf8') !== expected
  );
  if (stale.length > 0) {
    for (const [targetPath] of stale) {
      console.error(`Widget renderer contract is stale: ${path.relative(root, targetPath)}`);
    }
    console.error('Run npm run generate:widget-contract.');
    process.exit(1);
  }
  console.log('Widget renderer contract generated files are current.');
} else {
  for (const [targetPath, contents] of outputs) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, contents);
    console.log(`Generated ${path.relative(root, targetPath)}`);
  }
}

function validate(value) {
  assert(value.version === 1, 'version must be 1');
  assert(value.card?.contentPadding > 0, 'card.contentPadding must be positive');

  const variants = value.heatmap?.variants;
  assert(
    variants && Object.keys(variants).join(',') === 'week,month,year',
    'heatmap variants must be week, month, and year in that order'
  );
  assert(value.heatmap.weekdayLabels?.length === 7, 'heatmap must have seven weekday labels');
  assert(variants.week.rangeDays === 7, 'week range must be seven days');
  assert(variants.month.rangeDays === 0, 'five-week range must not use rolling days');
  assert(variants.month.rangeWeeks === 5, 'month variant must cover five calendar weeks');
  assert(variants.month.showLeadingCalendarCells === false, 'five-week range has no leading cells');
  assert(variants.year.rangeMonths === 6, 'year variant must represent six months');
  const cellLabelColorPolicy = value.heatmap.cellLabelColorPolicy;
  const cellLabelColorRoles = ['detail', 'title', 'accentText'];
  assert(cellLabelColorPolicy, 'heatmap.cellLabelColorPolicy is required');
  for (const key of ['empty', 'filled', 'strongFilled']) {
    assert(
      cellLabelColorRoles.includes(cellLabelColorPolicy[key]),
      `heatmap.cellLabelColorPolicy.${key} is not supported`
    );
  }
  assert(
    Number.isInteger(cellLabelColorPolicy.strongMinimumBucket) &&
      cellLabelColorPolicy.strongMinimumBucket > 0,
    'heatmap.cellLabelColorPolicy.strongMinimumBucket must be a positive integer'
  );
  assert(
    Number.isInteger(cellLabelColorPolicy.strongMinimumDurationSeconds) &&
      cellLabelColorPolicy.strongMinimumDurationSeconds > 0,
    'heatmap.cellLabelColorPolicy.strongMinimumDurationSeconds must be a positive integer'
  );
  assert(
    variants.year.monthBoundaryGapSlots === 7,
    'six-month month boundaries must insert one seven-slot column'
  );
  assert(variants.week.headerVisible === false, 'week header must remain hidden');
  const headerSummaries = ['none', 'count', 'countTotalAverage'];
  const calendarAlignments = [
    'rollingDays',
    'calendarWeeks',
    'continuousMonthsWithBoundarySlots',
  ];
  for (const [name, variant] of Object.entries(variants)) {
    assert(variant.contentPadding > 0, `${name}.contentPadding must be positive`);
    assert(
      headerSummaries.includes(variant.headerSummary),
      `${name}.headerSummary is not supported`
    );
    assert(
      calendarAlignments.includes(variant.calendarAlignment),
      `${name}.calendarAlignment is not supported`
    );
    assert(
      Number.isInteger(variant.rangeWeeks) && variant.rangeWeeks >= 0,
      `${name}.rangeWeeks must be a non-negative integer`
    );
    assert(
      variant.headerVisible === (variant.headerSummary !== 'none'),
      `${name}.headerVisible must agree with headerSummary`
    );
  }
  assert(variants.week.calendarAlignment === 'rollingDays', 'week must use a rolling calendar');
  assert(
    variants.month.calendarAlignment === 'calendarWeeks',
    'month must use a fixed calendar-week window'
  );
  assert(
    variants.year.calendarAlignment === 'continuousMonthsWithBoundarySlots',
    'six months must use continuous month boundary slots'
  );

  const footer = value.heatmap.weekFooter;
  assert(
    footer.statOrder?.join(',') === 'count,totalDuration,averageDuration',
    'week footer stat order must be count, total duration, average duration'
  );
  assert(footer.statOrder.length === footer.statLabels?.length, 'week footer labels must match stats');
  assert(footer.alwaysShowRecent === true, 'week recent section must always be visible');
  const monthFooter = value.heatmap.monthFooter;
  assert(
    monthFooter?.statOrder?.join(',') === 'count,totalDuration',
    'month footer stat order must be count, total duration'
  );
  assert(typeof monthFooter.separator === 'string', 'month footer separator must be a string');
  assert(
    typeof monthFooter.totalDurationPrefix === 'string',
    'month footer total duration prefix must be a string'
  );
  assert(value.lockScreen?.summaryDays === 7, 'lock-screen summary must cover seven days');

  const compact = value.liveActivity?.compact;
  assert(compact, 'liveActivity.compact is required');
  for (const [name, dimension] of Object.entries(compact)) {
    assert(Number.isFinite(dimension) && dimension > 0, `liveActivity.compact.${name} must be positive`);
  }
  assert(
    compact.leadingWidth === compact.trailingWidth,
    'compact Live Activity leading and trailing widths must be balanced'
  );

  const expanded = value.liveActivity?.expanded;
  assert(expanded, 'liveActivity.expanded is required');
  assert(
    expanded.regions?.title === 'leading' &&
      expanded.regions?.timer === 'center' &&
      expanded.regions?.endButton === 'trailing',
    'expanded Live Activity regions must be leading, center, and trailing'
  );
  assert(
    expanded.sideRegionVerticalAlignment === 'center',
    'expanded Live Activity side regions must be vertically centered'
  );
  assert(
    expanded.timerHorizontalAlignment === 'trailing',
    'expanded Live Activity timer must use trailing alignment'
  );
  for (const [name, dimension] of Object.entries(expanded)) {
    if (name !== 'regions' && !name.endsWith('Alignment')) {
      assert(Number.isFinite(dimension) && dimension > 0, `liveActivity.expanded.${name} must be positive`);
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Invalid widget renderer contract: ${message}`);
  }
}

function renderTypeScript(value) {
  return `// Generated by scripts/generate-widget-renderer-contract.mjs. Do not edit.\n` +
    `// Edit src/widgets/widget-renderer-contract.json and regenerate instead.\n\n` +
    `export const WIDGET_RENDERER_CONTRACT = ${JSON.stringify(value, null, 2)} as const;\n\n` +
    `export type WidgetRendererContract = typeof WIDGET_RENDERER_CONTRACT;\n`;
}

function renderSwift(value) {
  const variants = value.heatmap.variants;
  const heatmapVariant = (variant) => `LoofitHeatmapRendererSpec(
      title: ${swiftString(variant.title)},
      rangeDays: ${variant.rangeDays},
      rangeWeeks: ${variant.rangeWeeks},
      rangeMonths: ${variant.rangeMonths},
      columns: ${variant.columns},
      contentPadding: ${swiftNumber(variant.contentPadding)},
      cellGap: ${swiftNumber(variant.cellGap)},
      cellRadius: ${swiftNumber(variant.cellRadius)},
      cellLabelSize: ${swiftNumber(variant.cellLabelSize)},
      headerGap: ${swiftNumber(variant.headerGap)},
      headerVisible: ${variant.headerVisible},
      headerFontSize: ${swiftNumber(variant.headerFontSize)},
      headerSummary: .${swiftCase(variant.headerSummary)},
      calendarAlignment: .${swiftCase(variant.calendarAlignment)},
      showLeadingCalendarCells: ${variant.showLeadingCalendarCells},
      monthBoundaryGapSlots: ${variant.monthBoundaryGapSlots},
      reservedHeaderHeight: ${swiftNumber(variant.reservedHeaderHeight)},
      reservedFooterHeight: ${swiftNumber(variant.reservedFooterHeight)}
    )`;
  const copy = value.lockScreen.copy;
  const footer = value.heatmap.weekFooter;
  const monthFooter = value.heatmap.monthFooter;
  const control = value.control;
  const lock = value.lockScreen;
  const summary = lock.summary;
  const compact = value.liveActivity.compact;
  const expanded = value.liveActivity.expanded;

  return `// Generated by scripts/generate-widget-renderer-contract.mjs. Do not edit.
// Edit src/widgets/widget-renderer-contract.json and regenerate instead.

import CoreGraphics
import SwiftUI
import WidgetKit

enum LoofitHeatmapHeaderSummary {
  case none
  case count
  case countTotalAverage
}

enum LoofitHeatmapCalendarAlignment {
  case rollingDays
  case calendarWeeks
  case continuousMonthsWithBoundarySlots
}

enum LoofitHeatmapStat {
  case count
  case totalDuration
  case averageDuration
}

enum LoofitHeatmapCellLabelColorRole {
  case detail
  case title
  case accentText
}

struct LoofitHeatmapRendererSpec {
  let title: String
  let rangeDays: Int
  let rangeWeeks: Int
  let rangeMonths: Int
  let columns: Int
  let contentPadding: CGFloat
  let cellGap: CGFloat
  let cellRadius: CGFloat
  let cellLabelSize: CGFloat
  let headerGap: CGFloat
  let headerVisible: Bool
  let headerFontSize: CGFloat
  let headerSummary: LoofitHeatmapHeaderSummary
  let calendarAlignment: LoofitHeatmapCalendarAlignment
  let showLeadingCalendarCells: Bool
  let monthBoundaryGapSlots: Int
  let reservedHeaderHeight: CGFloat
  let reservedFooterHeight: CGFloat
}

enum LoofitWidgetRendererContract {
  static let version = ${value.version}
  static let contentPadding: CGFloat = ${swiftNumber(value.card.contentPadding)}

  enum Control {
    static let headerHeight: CGFloat = ${swiftNumber(control.headerHeight)}
    static let bodyHeight: CGFloat = ${swiftNumber(control.bodyHeight)}
    static let bodyGap: CGFloat = ${swiftNumber(control.bodyGap)}
    static let activeDotSize: CGFloat = ${swiftNumber(control.activeDotSize)}
    static let activeDotGap: CGFloat = ${swiftNumber(control.activeDotGap)}
    static let buttonHeight: CGFloat = ${swiftNumber(control.buttonHeight)}
    static let buttonRadius: CGFloat = ${swiftNumber(control.buttonRadius)}
    static let footerHeight: CGFloat = ${swiftNumber(control.footerWithRangeHeight)}
    static let footerGap: CGFloat = ${swiftNumber(control.footerGap)}
    static let titleSize: CGFloat = ${swiftNumber(control.text.title.size)}
    static let timerSize: CGFloat = ${swiftNumber(control.text.timer.size)}
    static let detailSize: CGFloat = ${swiftNumber(control.text.detail.size)}
    static let buttonTextSize: CGFloat = ${swiftNumber(control.text.button.size)}
    static let durationSize: CGFloat = ${swiftNumber(control.text.duration.size)}
    static let rangeSize: CGFloat = ${swiftNumber(control.text.range.size)}
  }

  enum LiveActivity {
    enum Compact {
      static let leadingWidth: CGFloat = ${swiftNumber(compact.leadingWidth)}
      static let trailingWidth: CGFloat = ${swiftNumber(compact.trailingWidth)}
      static let fontSize: CGFloat = ${swiftNumber(compact.fontSize)}
    }

    enum Expanded {
      static let titleRegion: DynamicIslandExpandedRegionPosition = .${swiftCase(expanded.regions.title)}
      static let timerRegion: DynamicIslandExpandedRegionPosition = .${swiftCase(expanded.regions.timer)}
      static let endButtonRegion: DynamicIslandExpandedRegionPosition = .${swiftCase(expanded.regions.endButton)}
      static let sideRegionAlignment: Alignment = .${swiftCase(expanded.sideRegionVerticalAlignment)}
      static let timerAlignment: Alignment = .${swiftCase(expanded.timerHorizontalAlignment)}
      static let timerRegionPriority: Double = ${swiftNumber(expanded.timerRegionPriority)}
      static let titleFontSize: CGFloat = ${swiftNumber(expanded.titleFontSize)}
      static let titleMinimumScaleFactor: CGFloat = ${swiftNumber(expanded.titleMinimumScaleFactor)}
      static let timerFontSize: CGFloat = ${swiftNumber(expanded.timerFontSize)}
      static let timerLineHeight: CGFloat = ${swiftNumber(expanded.timerLineHeight)}
      static let buttonWidth: CGFloat = ${swiftNumber(expanded.buttonWidth)}
      static let buttonHeight: CGFloat = ${swiftNumber(expanded.buttonHeight)}
      static let buttonFontSize: CGFloat = ${swiftNumber(expanded.buttonFontSize)}
    }
  }

  enum Heatmap {
    static let weekdayLabels = ${swiftStringArray(value.heatmap.weekdayLabels)}
    static let weekdayLabelSize: CGFloat = ${swiftNumber(value.text.calendar.weekdaySize)}
    static let emptyCellLabelColorRole: LoofitHeatmapCellLabelColorRole = .${swiftCase(value.heatmap.cellLabelColorPolicy.empty)}
    static let filledCellLabelColorRole: LoofitHeatmapCellLabelColorRole = .${swiftCase(value.heatmap.cellLabelColorPolicy.filled)}
    static let strongFilledCellLabelColorRole: LoofitHeatmapCellLabelColorRole = .${swiftCase(value.heatmap.cellLabelColorPolicy.strongFilled)}
    static let strongCellLabelMinimumDurationSeconds = ${value.heatmap.cellLabelColorPolicy.strongMinimumDurationSeconds}
    static let week = ${heatmapVariant(variants.week)}
    static let month = ${heatmapVariant(variants.month)}
    static let year = ${heatmapVariant(variants.year)}

    static let monthLabelSize: CGFloat = ${swiftNumber(value.heatmap.sixMonth.monthLabelSize)}
    static let monthLabelHeight: CGFloat = ${swiftNumber(value.heatmap.sixMonth.monthLabelHeight)}
    static let monthHeaderBottomGap: CGFloat = ${swiftNumber(value.heatmap.sixMonth.monthHeaderBottomGap)}

    enum WeekFooter {
      static let statOrder: [LoofitHeatmapStat] = ${swiftCaseArray(footer.statOrder)}
      static let statLabels = ${swiftStringArray(footer.statLabels)}
      static let recentLabel = ${swiftString(footer.recentLabel)}
      static let emptyRecentLabel = ${swiftString(footer.emptyRecentLabel)}
      static let alwaysShowRecent = ${footer.alwaysShowRecent}
      static let recentLimit = ${footer.recentLimit}
      static let topRowGap: CGFloat = ${swiftNumber(footer.topRowGap)}
      static let statGap: CGFloat = ${swiftNumber(footer.statGap)}
      static let recentRowGap: CGFloat = ${swiftNumber(footer.recentRowGap)}
      static let statLabelSize: CGFloat = ${swiftNumber(footer.statLabelSize)}
      static let statValueSize: CGFloat = ${swiftNumber(footer.statValueSize)}
      static let recentLabelSize: CGFloat = ${swiftNumber(footer.recentLabelSize)}
      static let recentValueSize: CGFloat = ${swiftNumber(footer.recentValueSize)}
      static let recentMetaSize: CGFloat = ${swiftNumber(footer.recentMetaSize)}
    }

    enum MonthFooter {
      static let statOrder: [LoofitHeatmapStat] = ${swiftCaseArray(monthFooter.statOrder)}
      static let separator = ${swiftString(monthFooter.separator)}
      static let totalDurationPrefix = ${swiftString(monthFooter.totalDurationPrefix)}
    }
  }

  enum LockScreen {
    static let active = ${swiftString(copy.active)}
    static let completedEyebrow = ${swiftString(copy.completedEyebrow)}
    static let completedBadge = ${swiftString(copy.completedBadge)}
    static let idle = ${swiftString(copy.idle)}
    static let routineRequired = ${swiftString(copy.routineRequired)}
    static let summaryTitle = ${swiftString(copy.summaryTitle)}
    static let compactCharacterLimit = ${lock.compactCharacterLimit}
    static let summaryDays = ${lock.summaryDays}
    static let inlineFontSize: CGFloat = ${swiftNumber(lock.inlineFontSize)}
    static let circularDefaultFontSize: CGFloat = ${swiftNumber(lock.circularDefaultFontSize)}
    static let circularCompletedFontSize: CGFloat = ${swiftNumber(lock.circularCompletedFontSize)}
    static let rectangularTitleFontSize: CGFloat = ${swiftNumber(lock.rectangularTitleFontSize)}
    static let rectangularDetailFontSize: CGFloat = ${swiftNumber(lock.rectangularDetailFontSize)}

    enum Summary {
      static let cellSize: CGFloat = ${swiftNumber(summary.cellSize)}
      static let cellGap: CGFloat = ${swiftNumber(summary.cellGap)}
      static let cellRadius: CGFloat = ${swiftNumber(summary.cellRadius)}
      static let fontSize: CGFloat = ${swiftNumber(summary.fontSize)}
      static let contentGap: CGFloat = ${swiftNumber(summary.contentGap)}
      static let contentPadding: CGFloat = ${swiftNumber(summary.contentPadding)}
    }
  }
}
`;
}

function renderCoreSwift(value) {
  const variants = value.heatmap.variants;
  return `// Generated by scripts/generate-widget-renderer-contract.mjs. Do not edit.
// Edit src/widgets/widget-renderer-contract.json and regenerate instead.

public enum LoofitWidgetLayoutContract {
  public static let calendarRows = ${value.heatmap.weekdayLabels.length}

  public enum HeaderSummary: String, Sendable {
    case none
    case count
    case countTotalAverage
  }

  public enum CalendarAlignment: String, Sendable {
    case rollingDays
    case calendarWeeks
    case continuousMonthsWithBoundarySlots
  }

  public enum HeatmapStat: String, Sendable {
    case count
    case totalDuration
    case averageDuration
  }

  public enum Heatmap {
    public static let weekRangeDays = ${variants.week.rangeDays}
    public static let monthRangeWeeks = ${variants.month.rangeWeeks}
    public static let sixMonthRangeMonths = ${variants.year.rangeMonths}
    public static let monthBoundaryGapSlots = ${variants.year.monthBoundaryGapSlots}
    public static let weekHeaderSummary: HeaderSummary = .${swiftCase(variants.week.headerSummary)}
    public static let monthHeaderSummary: HeaderSummary = .${swiftCase(variants.month.headerSummary)}
    public static let sixMonthHeaderSummary: HeaderSummary = .${swiftCase(variants.year.headerSummary)}
    public static let weekCalendarAlignment: CalendarAlignment = .${swiftCase(variants.week.calendarAlignment)}
    public static let monthCalendarAlignment: CalendarAlignment = .${swiftCase(variants.month.calendarAlignment)}
    public static let sixMonthCalendarAlignment: CalendarAlignment = .${swiftCase(variants.year.calendarAlignment)}
    public static let weekStatOrder: [HeatmapStat] = ${swiftCaseArray(value.heatmap.weekFooter.statOrder)}
    public static let monthStatOrder: [HeatmapStat] = ${swiftCaseArray(value.heatmap.monthFooter.statOrder)}
    public static let weekAlwaysShowsRecent = ${value.heatmap.weekFooter.alwaysShowRecent}
  }

  public enum LockScreen {
    public static let summaryDays = ${value.lockScreen.summaryDays}
  }
}
`;
}

function swiftNumber(value) {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot render non-finite Swift number: ${value}`);
  }
  return Number.isInteger(value) ? `${value}` : `${value}`;
}

function swiftString(value) {
  return JSON.stringify(value);
}

function swiftStringArray(values) {
  return `[${values.map(swiftString).join(', ')}]`;
}

function swiftCase(value) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`Cannot render invalid Swift enum case: ${value}`);
  }
  return value;
}

function swiftCaseArray(values) {
  return `[${values.map((value) => `.${swiftCase(value)}`).join(', ')}]`;
}
