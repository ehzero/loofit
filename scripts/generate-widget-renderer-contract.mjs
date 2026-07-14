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

const sourceContract = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
validateTokenSource(sourceContract);
const contract = applyComponentRecipes(resolveTokenReferences(sourceContract));
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
  assert(
    value.contentMargins?.home?.mode === 'proportionalToShortestEdge' &&
      value.contentMargins.home.referenceShortestEdge > 0 &&
      value.contentMargins.home.referenceShortestEdge === value.control?.cardSize,
    'home widget content margins must scale from a positive reference shortest edge'
  );
  assert(
    value.contentMargins?.accessory?.mode === 'systemManaged',
    'accessory widget content margins must remain system-managed'
  );
  assert(
    value.control?.verticalDistribution === 'spaceBetween',
    'small control widget regions must use responsive space-between distribution'
  );
  for (const legacySlot of ['headerHeight', 'bodyHeight', 'footerWithRangeHeight']) {
    assert(
      value.control[legacySlot] === undefined,
      `control.${legacySlot} must not reserve a fixed region height`
    );
  }

  const routineProgress = value.routineProgress;
  const routineProgressTextList = routineProgress?.textList;
  assert(
    routineProgressTextList?.availability === 'native' &&
      routineProgressTextList.kindAccessor === 'routineProgress' &&
      routineProgressTextList.family === 'systemSmall',
    'routine progress text list must remain a native systemSmall widget'
  );
  assert(
    routineProgressTextList.progressBasis === 'nextSplitPosition' &&
      routineProgressTextList.orientation === 'vertical' &&
      routineProgressTextList.verticalDistribution === 'spaceBetween' &&
      routineProgressTextList.visibleItemLimit === 3 &&
      routineProgressTextList.visibleItemSelection === 'currentCentered',
    'routine progress text list must use next-split position and space-between distribution'
  );
  assert(
    routineProgressTextList.currentTextColorRole === 'accent' &&
      routineProgressTextList.nonCurrentTextColorRole === 'textLow' &&
      routineProgressTextList.rowContent?.join(',') === 'split,relativeDay,bodyParts,duration',
    'routine progress text list must accent the current split, mute other splits, and show split, relative day, body parts, duration'
  );
  const routineProgressLockScreen = routineProgressTextList.lockScreen;
  assert(
    routineProgressLockScreen?.availability === 'native' &&
      routineProgressLockScreen.kindAccessor === 'lockScreenRoutineProgress' &&
      routineProgressLockScreen.family === 'accessoryRectangular' &&
      routineProgressLockScreen.orientation === 'horizontal',
    'lock-screen routine progress must remain a preview-only horizontal accessoryRectangular widget'
  );
  assert(
    routineProgressLockScreen.visibleItemLimit === 3 &&
      routineProgressLockScreen.visibleItemSelection === 'currentCentered' &&
      routineProgressLockScreen.progressBasis === 'nextSplitPosition' &&
      routineProgressLockScreen.horizontalAlignment === 'center' &&
      routineProgressLockScreen.rowContent?.join(',') ===
        'workoutAliasOrBodyParts,relativeDay',
    'lock-screen routine progress must center three workout aliases or body parts with relative days'
  );
  assert(
    routineProgressLockScreen.currentTextColorRole === 'textHigh' &&
      routineProgressLockScreen.nonCurrentTextColorRole === 'textLow',
    'lock-screen routine progress must emphasize only the current split'
  );

  const bodyPartDuration = value.bodyPartDuration;
  assert(
    bodyPartDuration?.availability === 'native' &&
      bodyPartDuration.kindAccessor === 'bodyPartDuration' &&
      bodyPartDuration.family === 'systemSmall',
    'body part duration must remain a native systemSmall widget'
  );
  assert(
    bodyPartDuration.rangeDays === 30 &&
      bodyPartDuration.durationAttribution === 'fullSessionPerBodyPart',
    'body part duration must cover 30 days and attribute the full session to each body part'
  );
  assert(
    bodyPartDuration.sort === 'durationDescending' &&
      bodyPartDuration.visibleItemLimit === 4 &&
      bodyPartDuration.verticalDistribution === 'spaceBetween',
    'body part duration must show four descending items with space-between distribution'
  );

  const variants = value.heatmap?.variants;
  assert(
    variants && Object.keys(variants).join(',') === 'week,month,year',
    'heatmap variants must be week, month, and year in that order'
  );
  assert(value.heatmap.weekdayLabels?.length === 7, 'heatmap must have seven weekday labels');
  assert(
    value.heatmap.weekdayLabelHeightInCells === 1,
    'heatmap weekday label height must match one grid cell'
  );
  const weekdayLabelColorPolicy = value.heatmap.weekdayLabelColorPolicy;
  assert(
    weekdayLabelColorPolicy?.weekendLabels?.length === 2 &&
      weekdayLabelColorPolicy.weekendLabels.every((label) =>
        value.heatmap.weekdayLabels.includes(label)
      ),
    'heatmap weekend labels must contain two known weekday labels'
  );
  assert(
    weekdayLabelColorPolicy.weekendRole === 'textWeekend',
    'heatmap weekend labels must use the textWeekend role'
  );
  assert(variants.week.rangeDays === 7, 'week range must be seven days');
  assert(variants.month.rangeDays === 0, 'five-week range must not use rolling days');
  assert(variants.month.rangeWeeks === 5, 'month variant must cover five calendar weeks');
  assert(variants.month.showLeadingCalendarCells === false, 'five-week range has no leading cells');
  for (const key of ['columns', 'contentPadding', 'cellGap', 'cellRadius', 'cellLabelSize']) {
    assert(
      variants.week[key] === variants.month[key],
      `week and five-week heatmaps must share ${key}`
    );
  }
  assert(variants.year.rangeMonths === 6, 'year variant must represent six months');
  const cellLabelColorPolicy = value.heatmap.cellLabelColorPolicy;
  const cellLabelColorRoles = ['textLow', 'textHigh', 'onAccent'];
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
  assert(variants.week.style === 'detailed', 'week must use the detailed heatmap style');
  assert(variants.month.style === 'detailed', 'five weeks must use the detailed heatmap style');
  assert(variants.year.style === 'compact', 'six months must use the compact heatmap style');
  const currentMonthPreview = value.heatmap.previewVariants?.currentMonth;
  assert(
    currentMonthPreview?.style === 'detailed' &&
      currentMonthPreview.availability === 'native' &&
      currentMonthPreview.kindAccessor === 'currentMonthCalendar' &&
      currentMonthPreview.family === 'systemSmall' &&
      currentMonthPreview.headerSummary === 'count' &&
      currentMonthPreview.maxRows === 6 &&
      currentMonthPreview.outsideMonthCells === 'dateLabelOnly',
    'current-month preview must use the detailed style with a count summary and up to six rows'
  );
  assert(
    currentMonthPreview.todayIndicator?.style === 'border' &&
      currentMonthPreview.todayIndicator.colorRole === 'todayIndicator' &&
      currentMonthPreview.todayIndicator.width > 0,
    'current-month preview must use the theme-aware today indicator border'
  );
  const fourWeekExpandedPreview = value.heatmap.previewVariants?.fourWeekExpanded;
  assert(
    fourWeekExpandedPreview?.style === 'expanded' &&
      fourWeekExpandedPreview.availability === 'native' &&
      fourWeekExpandedPreview.kindAccessor === 'heatmapFourWeekExpanded' &&
      fourWeekExpandedPreview.family === 'systemMedium',
    'expanded four-week heatmap must remain a native systemMedium widget'
  );
  assert(
    fourWeekExpandedPreview.rangeWeeks === 4 &&
      fourWeekExpandedPreview.calendarAlignment === 'calendarWeeks',
    'expanded four-week heatmap must cover four calendar weeks'
  );
  assert(
    fourWeekExpandedPreview.cellContent === 'dayAndBodyParts' &&
      fourWeekExpandedPreview.bodyPartMaxLines === 1,
    'expanded four-week heatmap must show one line of body parts below each day'
  );
  assert(
    Object.values(variants).every(
      (variant) => variant.contentPadding === value.designSystem.contentPadding
    ),
    'home-screen heatmaps must share the canonical content padding'
  );
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

function validateTokenSource(value) {
  const designSystem = value.designSystem;
  assert(designSystem?.spacing, 'designSystem.spacing is required');
  assert(designSystem?.radius, 'designSystem.radius is required');
  assert(designSystem?.typography, 'designSystem.typography is required');
  assert(designSystem?.fontWeight, 'designSystem.fontWeight is required');
  assert(designSystem?.opacity, 'designSystem.opacity is required');
  assert(designSystem?.minimumScale, 'designSystem.minimumScale is required');
  assert(designSystem?.colorRoles, 'designSystem.colorRoles is required');

  for (const [name, spacing] of Object.entries(designSystem.spacing)) {
    assert(Number.isFinite(spacing) && spacing >= 0, `designSystem.spacing.${name} must be non-negative`);
  }
  for (const [name, radius] of Object.entries(designSystem.radius)) {
    assert(Number.isFinite(radius) && radius >= 0, `designSystem.radius.${name} must be non-negative`);
  }
  assert(
    Object.keys(designSystem.spacing).join(',') === 'xs,sm,md,lg',
    'designSystem.spacing must contain only xs, sm, md, and lg'
  );
  assert(
    Object.keys(designSystem.radius).join(',') === 'cell,control,container',
    'designSystem.radius must contain only cell, control, and container'
  );
  assert(
    Object.keys(designSystem.typography).join(',') === 'sm,md,lg,xl',
    'designSystem.typography must contain only sm, md, lg, and xl'
  );
  for (const [name, typography] of Object.entries(designSystem.typography)) {
    assert(typography.size > 0, `designSystem.typography.${name}.size must be positive`);
    assert(
      typography.lineHeight >= typography.size,
      `designSystem.typography.${name}.lineHeight must fit its font size`
    );
  }
  assert(
    Object.keys(designSystem.fontWeight).join(',') === 'bold,medium,light' &&
      Object.values(designSystem.fontWeight).join(',') === '800,700,600',
    'designSystem.fontWeight must contain bold 800, medium 700, and light 600'
  );
  for (const [name, opacity] of Object.entries(designSystem.opacity)) {
    assert(opacity > 0 && opacity <= 1, `designSystem.opacity.${name} must be in (0, 1]`);
  }
  for (const [name, scale] of Object.entries(designSystem.minimumScale)) {
    assert(scale > 0 && scale <= 1, `designSystem.minimumScale.${name} must be in (0, 1]`);
  }

  const expectedColorRoles = [
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
  ];
  assert(
    Object.keys(designSystem.colorRoles).join(',') === expectedColorRoles.join(','),
    'designSystem.colorRoles must expose the canonical semantic roles in order'
  );

  for (const path of [
    ['card', 'radius'],
    ['card', 'contentPadding'],
    ['card', 'contentGap'],
    ['heatmap', 'styles', 'detailed', 'contentPadding'],
    ['heatmap', 'styles', 'detailed', 'cellGap'],
    ['heatmap', 'styles', 'detailed', 'cellRadius'],
    ['heatmap', 'styles', 'expanded', 'contentPadding'],
    ['heatmap', 'styles', 'expanded', 'cellGap'],
    ['heatmap', 'styles', 'expanded', 'cellRadius'],
    ['heatmap', 'styles', 'expanded', 'cellLabelSize'],
    ['heatmap', 'styles', 'expanded', 'cellLabelLineHeight'],
    ['heatmap', 'styles', 'expanded', 'bodyPartLabelSize'],
    ['heatmap', 'styles', 'expanded', 'bodyPartLabelLineHeight'],
    ['heatmap', 'styles', 'expanded', 'bodyPartLabelOpacity'],
    ['heatmap', 'styles', 'expanded', 'cellContentGap'],
    ['heatmap', 'styles', 'expanded', 'weekdayHeaderHeight'],
    ['heatmap', 'styles', 'expanded', 'headerGap'],
    ['heatmap', 'styles', 'expanded', 'headerFontSize'],
    ['heatmap', 'styles', 'compact', 'contentPadding'],
    ['heatmap', 'styles', 'compact', 'cellGap'],
    ['heatmap', 'styles', 'compact', 'cellRadius'],
    ['routineProgress', 'textList', 'contentPadding'],
    ['routineProgress', 'textList', 'text', 'split', 'size'],
    ['routineProgress', 'textList', 'text', 'split', 'lineHeight'],
    ['routineProgress', 'textList', 'text', 'split', 'weight'],
    ['routineProgress', 'textList', 'text', 'metadata', 'size'],
    ['routineProgress', 'textList', 'text', 'metadata', 'lineHeight'],
    ['routineProgress', 'textList', 'text', 'metadata', 'weight'],
    ['routineProgress', 'textList', 'lockScreen', 'contentPadding'],
    ['routineProgress', 'textList', 'lockScreen', 'columnGap'],
    ['routineProgress', 'textList', 'lockScreen', 'itemGap'],
    ['routineProgress', 'textList', 'lockScreen', 'text', 'workout', 'size'],
    ['routineProgress', 'textList', 'lockScreen', 'text', 'workout', 'lineHeight'],
    ['routineProgress', 'textList', 'lockScreen', 'text', 'workout', 'weight'],
    ['routineProgress', 'textList', 'lockScreen', 'text', 'relativeDay', 'size'],
    ['routineProgress', 'textList', 'lockScreen', 'text', 'relativeDay', 'lineHeight'],
    ['routineProgress', 'textList', 'lockScreen', 'text', 'relativeDay', 'weight'],
    ['bodyPartDuration', 'contentPadding'],
    ['bodyPartDuration', 'bar', 'height'],
    ['bodyPartDuration', 'bar', 'radius'],
    ['bodyPartDuration', 'text', 'title', 'size'],
    ['bodyPartDuration', 'text', 'title', 'lineHeight'],
    ['bodyPartDuration', 'text', 'title', 'weight'],
    ['bodyPartDuration', 'text', 'bodyPart', 'size'],
    ['bodyPartDuration', 'text', 'bodyPart', 'lineHeight'],
    ['bodyPartDuration', 'text', 'bodyPart', 'weight'],
    ['bodyPartDuration', 'text', 'duration', 'size'],
    ['bodyPartDuration', 'text', 'duration', 'lineHeight'],
    ['bodyPartDuration', 'text', 'duration', 'weight'],
  ]) {
    const raw = valueAtPath(value, path);
    assert(isTokenReference(raw), `${path.join('.')} must reference a design token`);
  }
}

function applyComponentRecipes(value) {
  const styles = value.heatmap.styles;
  const variants = Object.fromEntries(
    Object.entries(value.heatmap.variants).map(([name, variant]) => {
      const style = styles[variant.style];
      assert(style, `unknown heatmap style for ${name}: ${variant.style}`);
      return [name, { ...style, ...variant }];
    })
  );
  const previewVariants = Object.fromEntries(
    Object.entries(value.heatmap.previewVariants).map(([name, variant]) => {
      const style = styles[variant.style];
      assert(style, `unknown heatmap preview style for ${name}: ${variant.style}`);
      return [name, { ...style, ...variant }];
    })
  );
  return {
    ...value,
    heatmap: {
      ...value.heatmap,
      variants,
      previewVariants,
    },
  };
}

function resolveTokenReferences(source) {
  const tokenRoot = source.designSystem;

  function resolve(value, stack = []) {
    if (isTokenReference(value)) {
      const tokenPath = value.slice(1, -1);
      assert(!stack.includes(tokenPath), `circular design token reference: ${[...stack, tokenPath].join(' -> ')}`);
      const token = valueAtPath(tokenRoot, tokenPath.split('.'));
      assert(token !== undefined, `unknown design token reference: ${value}`);
      return resolve(token, [...stack, tokenPath]);
    }
    if (Array.isArray(value)) {
      return value.map((item) => resolve(item, stack));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, resolve(item, stack)])
      );
    }
    return value;
  }

  return resolve(source);
}

function isTokenReference(value) {
  return typeof value === 'string' && /^\{[A-Za-z0-9_.-]+\}$/.test(value);
}

function valueAtPath(value, path) {
  return path.reduce(
    (current, key) => (current && typeof current === 'object' ? current[key] : undefined),
    value
  );
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
  const currentMonth = value.heatmap.previewVariants.currentMonth;
  const fourWeekExpanded = value.heatmap.previewVariants.fourWeekExpanded;
  const routineProgress = value.routineProgress.textList;
  const routineProgressLock = routineProgress.lockScreen;
  const bodyPartDuration = value.bodyPartDuration;
  const lock = value.lockScreen;
  const summary = lock.summary;
  const banner = value.liveActivity.banner;
  const compact = value.liveActivity.compact;
  const minimal = value.liveActivity.minimal;
  const expanded = value.liveActivity.expanded;
  const fontWeight = value.designSystem.fontWeight;
  const contentMargins = value.contentMargins;

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
  case textLow
  case textHigh
  case onAccent
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

  enum ContentMargins {
    static let homeReferenceShortestEdge: CGFloat = ${swiftNumber(contentMargins.home.referenceShortestEdge)}
  }

  enum FontWeight {
    static let bold: Font.Weight = .${swiftFontWeight(fontWeight.bold)}
    static let medium: Font.Weight = .${swiftFontWeight(fontWeight.medium)}
    static let light: Font.Weight = .${swiftFontWeight(fontWeight.light)}
  }

  enum Spacing {
    static let xs: CGFloat = ${swiftNumber(value.designSystem.spacing.xs)}
    static let sm: CGFloat = ${swiftNumber(value.designSystem.spacing.sm)}
    static let md: CGFloat = ${swiftNumber(value.designSystem.spacing.md)}
    static let lg: CGFloat = ${swiftNumber(value.designSystem.spacing.lg)}
  }

  enum Radius {
    static let cell: CGFloat = ${swiftNumber(value.designSystem.radius.cell)}
    static let control: CGFloat = ${swiftNumber(value.designSystem.radius.control)}
    static let container: CGFloat = ${swiftNumber(value.designSystem.radius.container)}
  }

  enum Opacity {
    static let defaultValue: Double = ${swiftNumber(value.designSystem.opacity.default)}
    static let muted: Double = ${swiftNumber(value.designSystem.opacity.muted)}
  }

  enum MinimumScale {
    static let dense: CGFloat = ${swiftNumber(value.designSystem.minimumScale.dense)}
    static let defaultValue: CGFloat = ${swiftNumber(value.designSystem.minimumScale.default)}
  }

  enum Control {
    static let bodyGap: CGFloat = ${swiftNumber(control.bodyGap)}
    static let activeDotSize: CGFloat = ${swiftNumber(control.activeDotSize)}
    static let activeDotGap: CGFloat = ${swiftNumber(control.activeDotGap)}
    static let buttonHeight: CGFloat = ${swiftNumber(control.buttonHeight)}
    static let buttonRadius: CGFloat = ${swiftNumber(control.buttonRadius)}
    static let footerGap: CGFloat = ${swiftNumber(control.footerGap)}
    static let titleSize: CGFloat = ${swiftNumber(control.text.title.size)}
    static let timerSize: CGFloat = ${swiftNumber(control.text.timer.size)}
    static let detailSize: CGFloat = ${swiftNumber(control.text.detail.size)}
    static let buttonTextSize: CGFloat = ${swiftNumber(control.text.button.size)}
    static let durationSize: CGFloat = ${swiftNumber(control.text.duration.size)}
    static let rangeSize: CGFloat = ${swiftNumber(control.text.range.size)}
  }

  enum CurrentMonth {
    static let contentPadding: CGFloat = ${swiftNumber(currentMonth.contentPadding)}
    static let cellGap: CGFloat = ${swiftNumber(currentMonth.cellGap)}
    static let cellRadius: CGFloat = ${swiftNumber(currentMonth.cellRadius)}
    static let cellLabelSize: CGFloat = ${swiftNumber(currentMonth.cellLabelSize)}
    static let headerGap: CGFloat = ${swiftNumber(currentMonth.headerGap)}
    static let headerFontSize: CGFloat = ${swiftNumber(currentMonth.headerFontSize)}
    static let outsideMonthDateLabelOnly = ${currentMonth.outsideMonthCells === 'dateLabelOnly'}
    static let todayIndicatorWidth: CGFloat = ${swiftNumber(currentMonth.todayIndicator.width)}
  }

  enum FourWeekExpanded {
    static let rangeWeeks = ${fourWeekExpanded.rangeWeeks}
    static let columns = ${fourWeekExpanded.columns}
    static let contentPadding: CGFloat = ${swiftNumber(fourWeekExpanded.contentPadding)}
    static let cellGap: CGFloat = ${swiftNumber(fourWeekExpanded.cellGap)}
    static let cellRadius: CGFloat = ${swiftNumber(fourWeekExpanded.cellRadius)}
    static let cellLabelSize: CGFloat = ${swiftNumber(fourWeekExpanded.cellLabelSize)}
    static let cellLabelLineHeight: CGFloat = ${swiftNumber(fourWeekExpanded.cellLabelLineHeight)}
    static let bodyPartLabelSize: CGFloat = ${swiftNumber(fourWeekExpanded.bodyPartLabelSize)}
    static let bodyPartLabelLineHeight: CGFloat = ${swiftNumber(fourWeekExpanded.bodyPartLabelLineHeight)}
    static let bodyPartLabelOpacity: Double = ${swiftNumber(fourWeekExpanded.bodyPartLabelOpacity)}
    static let cellContentGap: CGFloat = ${swiftNumber(fourWeekExpanded.cellContentGap)}
    static let weekdayHeaderHeight: CGFloat = ${swiftNumber(fourWeekExpanded.weekdayHeaderHeight)}
    static let headerGap: CGFloat = ${swiftNumber(fourWeekExpanded.headerGap)}
    static let bodyPartSeparator = ${swiftString(fourWeekExpanded.bodyPartSeparator)}
  }

  enum RoutineProgress {
    static let visibleItemLimit = ${routineProgress.visibleItemLimit}
    static let contentPadding: CGFloat = ${swiftNumber(routineProgress.contentPadding)}
    static let metadataSeparator = ${swiftString(routineProgress.metadataSeparator)}
    static let emptyRelativeDay = ${swiftString(routineProgress.emptyRelativeDay)}
    static let splitSize: CGFloat = ${swiftNumber(routineProgress.text.split.size)}
    static let splitWeight: Font.Weight = .${swiftFontWeight(routineProgress.text.split.weight)}
    static let metadataSize: CGFloat = ${swiftNumber(routineProgress.text.metadata.size)}
    static let metadataWeight: Font.Weight = .${swiftFontWeight(routineProgress.text.metadata.weight)}

    enum LockScreen {
      static let visibleItemLimit = ${routineProgressLock.visibleItemLimit}
      static let contentPadding: CGFloat = ${swiftNumber(routineProgressLock.contentPadding)}
      static let columnGap: CGFloat = ${swiftNumber(routineProgressLock.columnGap)}
      static let itemGap: CGFloat = ${swiftNumber(routineProgressLock.itemGap)}
      static let workoutSize: CGFloat = ${swiftNumber(routineProgressLock.text.workout.size)}
      static let workoutWeight: Font.Weight = .${swiftFontWeight(routineProgressLock.text.workout.weight)}
      static let relativeDaySize: CGFloat = ${swiftNumber(routineProgressLock.text.relativeDay.size)}
      static let relativeDayWeight: Font.Weight = .${swiftFontWeight(routineProgressLock.text.relativeDay.weight)}
    }
  }

  enum BodyPartDuration {
    static let rangeDays = ${bodyPartDuration.rangeDays}
    static let visibleItemLimit = ${bodyPartDuration.visibleItemLimit}
    static let title = ${swiftString(bodyPartDuration.title)}
    static let contentPadding: CGFloat = ${swiftNumber(bodyPartDuration.contentPadding)}
    static let barHeight: CGFloat = ${swiftNumber(bodyPartDuration.bar.height)}
    static let barRadius: CGFloat = ${swiftNumber(bodyPartDuration.bar.radius)}
    static let titleSize: CGFloat = ${swiftNumber(bodyPartDuration.text.title.size)}
    static let titleWeight: Font.Weight = .${swiftFontWeight(bodyPartDuration.text.title.weight)}
    static let bodyPartSize: CGFloat = ${swiftNumber(bodyPartDuration.text.bodyPart.size)}
    static let bodyPartWeight: Font.Weight = .${swiftFontWeight(bodyPartDuration.text.bodyPart.weight)}
    static let durationSize: CGFloat = ${swiftNumber(bodyPartDuration.text.duration.size)}
    static let durationWeight: Font.Weight = .${swiftFontWeight(bodyPartDuration.text.duration.weight)}
  }

  enum LiveActivity {
    enum Banner {
      static let contentPadding: CGFloat = ${swiftNumber(banner.contentPadding)}
      static let contentGap: CGFloat = ${swiftNumber(banner.contentGap)}
      static let rowGap: CGFloat = ${swiftNumber(banner.rowGap)}
      static let titleFontSize: CGFloat = ${swiftNumber(banner.titleFontSize)}
      static let statusFontSize: CGFloat = ${swiftNumber(banner.statusFontSize)}
      static let timerFontSize: CGFloat = ${swiftNumber(banner.timerFontSize)}
      static let buttonWidth: CGFloat = ${swiftNumber(banner.buttonWidth)}
      static let buttonHeight: CGFloat = ${swiftNumber(banner.buttonHeight)}
      static let buttonFontSize: CGFloat = ${swiftNumber(banner.buttonFontSize)}
    }

    enum Compact {
      static let leadingWidth: CGFloat = ${swiftNumber(compact.leadingWidth)}
      static let trailingWidth: CGFloat = ${swiftNumber(compact.trailingWidth)}
      static let fontSize: CGFloat = ${swiftNumber(compact.fontSize)}
    }

    enum Minimal {
      static let fontSize: CGFloat = ${swiftNumber(minimal.fontSize)}
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
    static let weekdayLabelHeightInCells: CGFloat = ${swiftNumber(value.heatmap.weekdayLabelHeightInCells)}
    static let weekendWeekdayLabels = ${swiftStringArray(value.heatmap.weekdayLabelColorPolicy.weekendLabels)}
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
    static let inlineFontSize: CGFloat = ${swiftNumber(lock.text.inline.size)}
    static let circularDefaultFontSize: CGFloat = ${swiftNumber(lock.text.circular.size)}
    static let circularCompletedFontSize: CGFloat = ${swiftNumber(lock.text.circular.size)}
    static let rectangularTitleFontSize: CGFloat = ${swiftNumber(lock.text.rectangularTitle.size)}
    static let rectangularDetailFontSize: CGFloat = ${swiftNumber(lock.text.rectangularDetail.size)}

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
  const currentMonth = value.heatmap.previewVariants.currentMonth;
  const fourWeekExpanded = value.heatmap.previewVariants.fourWeekExpanded;
  const routineProgress = value.routineProgress.textList;
  const bodyPartDuration = value.bodyPartDuration;
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
    public static let currentMonthMaxRows = ${currentMonth.maxRows}
    public static let fourWeekExpandedRangeWeeks = ${fourWeekExpanded.rangeWeeks}
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

  public enum RoutineProgress {
    public static let visibleItemLimit = ${routineProgress.visibleItemLimit}
  }

  public enum BodyPartDuration {
    public static let rangeDays = ${bodyPartDuration.rangeDays}
    public static let visibleItemLimit = ${bodyPartDuration.visibleItemLimit}
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

function swiftFontWeight(value) {
  const weights = {
    '600': 'semibold',
    '700': 'bold',
    '800': 'heavy',
  };
  const weight = weights[value];
  if (!weight) {
    throw new Error(`Cannot render unsupported Swift font weight: ${value}`);
  }
  return weight;
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
