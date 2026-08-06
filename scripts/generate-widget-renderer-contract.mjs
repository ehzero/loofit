#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { renderAndroidWidgetPickerPreviewOutputs } from "./generate-android-widget-picker-previews.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src/widgets/widget-renderer-contract.json");
const typescriptPath = path.join(
  root,
  "src/widgets/generated/widget-renderer-contract.generated.ts",
);
const swiftPath = path.join(
  root,
  "plugins/native-widgets/LoofitWidgetRendererContract.generated.swift",
);
const coreSwiftPath = path.join(
  root,
  "modules/loofit-workout-core/ios/LoofitWidgetLayoutContract.generated.swift",
);
const coreKotlinPath = path.join(
  root,
  "modules/loofit-workout-core/android/src/main/java/com/loofit/workoutcore/LoofitWidgetLayoutContract.generated.kt",
);

const sourceContract = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
validateTokenSource(sourceContract);
const contract = applyComponentRecipes(resolveTokenReferences(sourceContract));
validate(contract);
const contractFingerprint = crypto
  .createHash("sha256")
  .update(JSON.stringify(contract))
  .digest("hex");

const outputs = new Map([
  [typescriptPath, renderTypeScript(contract, contractFingerprint)],
  [swiftPath, renderSwift(contract, contractFingerprint)],
  [coreSwiftPath, renderCoreSwift(contract, contractFingerprint)],
  [coreKotlinPath, renderCoreKotlin(contract, contractFingerprint)],
  ...renderAndroidWidgetProviderOutputs(contract, root),
  ...renderAndroidWidgetPickerPreviewOutputs(contract, root),
]);

if (process.argv.includes("--check")) {
  const stale = [...outputs].filter(
    ([targetPath, expected]) =>
      !fs.existsSync(targetPath) ||
      fs.readFileSync(targetPath, "utf8") !== expected,
  );
  if (stale.length > 0) {
    for (const [targetPath] of stale) {
      console.error(
        `Widget renderer contract is stale: ${path.relative(root, targetPath)}`,
      );
    }
    console.error("Run npm run generate:widget-contract.");
    process.exit(1);
  }
  console.log("Widget renderer contract generated files are current.");
} else {
  for (const [targetPath, contents] of outputs) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, contents);
    console.log(`Generated ${path.relative(root, targetPath)}`);
  }
}

function validate(value) {
  assert(value.version === 1, "version must be 1");
  assert(
    value.platformPolicy?.sharedSemantics?.join(",") ===
      "function,content,informationPriority,statePolicy,dataPolicy,interactionPolicy",
    "platform policy must keep the common functional and product semantics explicit",
  );
  assert(
    value.platformPolicy?.visualParity === "platformNative",
    "visual parity must allow platform-native rendering",
  );
  assert(
    value.platformPolicy?.ios?.visualBaseline === "frozen" &&
      value.platformPolicy.ios.renderer === "swiftUIWidgetKit" &&
      value.platformPolicy.ios.sizing === "widgetKitFamilies",
    "iOS must remain on the frozen WidgetKit visual baseline",
  );
  assert(
    value.platformPolicy?.android?.visualBaseline === "editable" &&
      value.platformPolicy.android.renderer === "bitmapAndRemoteViews" &&
      value.platformPolicy.android.sizing === "launcherExactSizes",
    "Android must use its editable bitmap/RemoteViews exact-size recipe",
  );
  assert(
    Object.keys(value.platformPolicy.android.previewViewports ?? {}).join(",") ===
      "homeSmall,homeMedium,accessoryRectangular",
    "Android preview viewports must expose all widget families in order",
  );
  for (const [name, viewport] of Object.entries(
    value.platformPolicy.android.previewViewports,
  )) {
    assert(
      Number.isFinite(viewport.width) &&
        viewport.width > 0 &&
        Number.isFinite(viewport.height) &&
        viewport.height > 0,
      `platformPolicy.android.previewViewports.${name} must have positive dimensions`,
    );
  }
  assert(
    Object.keys(value.platformPolicy.android.providerSizing ?? {}).join(",") ===
      "homeSmall,homeMedium,accessoryRectangular",
    "Android provider sizing must expose all widget families in order",
  );
  for (const [name, sizing] of Object.entries(
    value.platformPolicy.android.providerSizing,
  )) {
    assert(
      Object.keys(sizing).join(",") ===
        "minWidth,minHeight,targetCellWidth,targetCellHeight",
      `platformPolicy.android.providerSizing.${name} must expose every provider dimension in order`,
    );
    for (const [dimension, amount] of Object.entries(sizing)) {
      assert(
        Number.isInteger(amount) && amount > 0,
        `platformPolicy.android.providerSizing.${name}.${dimension} must be a positive integer`,
      );
    }
  }
  assert(
    value.platformPolicy.android.providerSizing.homeSmall.targetCellWidth === 2 &&
      value.platformPolicy.android.providerSizing.homeSmall.targetCellHeight === 2 &&
      value.platformPolicy.android.providerSizing.homeMedium.targetCellWidth === 4 &&
      value.platformPolicy.android.providerSizing.homeMedium.targetCellHeight === 2 &&
      value.platformPolicy.android.providerSizing.accessoryRectangular.minWidth === 250 &&
      value.platformPolicy.android.providerSizing.accessoryRectangular.minHeight === 40 &&
      value.platformPolicy.android.providerSizing.accessoryRectangular.targetCellWidth === 4 &&
      value.platformPolicy.android.providerSizing.accessoryRectangular.targetCellHeight === 1,
    "Android provider sizing must request 2x2 small, 4x2 medium, and 4x1 accessory footprints",
  );
  const accessoryPreviewBackdrop =
    value.platformPolicy.android.accessoryPreviewBackdrop;
  assert(
    Object.keys(accessoryPreviewBackdrop ?? {}).join(",") ===
      "mode,palette,colorRole,radius" &&
      accessoryPreviewBackdrop.mode === "representativeWallpaper" &&
      accessoryPreviewBackdrop.palette === "dark" &&
      accessoryPreviewBackdrop.colorRole === "surface" &&
      accessoryPreviewBackdrop.radius > 0,
    "Android accessory previews must use the representative dark wallpaper backdrop",
  );
  const expectedSurfaceKindKeys = [
    "control",
    "heatmapWeek",
    "heatmapMonth",
    "heatmapSixMonths",
    "currentMonth",
    "fourWeekExpanded",
    "routineProgress",
    "bodyPartDuration",
    "lockWorkout",
    "lockThreeWeek",
    "lockNextThreeWeek",
    "lockRoutineProgress",
  ];
  assert(
    Object.keys(value.surfaceKinds ?? {}).join(",") ===
      expectedSurfaceKindKeys.join(","),
    "surfaceKinds must declare the 12 shared iOS and Android surfaces in order",
  );
  assert(
    Object.values(value.surfaceKinds).every(
      (kind) => typeof kind === "string" && kind.length > 0,
    ) && new Set(Object.values(value.surfaceKinds)).size === expectedSurfaceKindKeys.length,
    "surfaceKinds must contain 12 distinct non-empty identifiers",
  );
  assert(
    value.card?.contentPadding > 0,
    "card.contentPadding must be positive",
  );
  assert(
    value.contentMargins?.home?.mode === "proportionalToShortestEdge" &&
      value.contentMargins.home.referenceShortestEdge > 0 &&
      value.contentMargins.home.referenceShortestEdge ===
        value.control?.cardSize,
    "home widget content margins must scale from a positive reference shortest edge",
  );
  assert(
    value.contentMargins?.accessory?.mode === "systemManaged",
    "accessory widget content margins must remain system-managed",
  );
  for (const [name, viewport] of Object.entries(value.previewViewports ?? {})) {
    assert(
      Number.isFinite(viewport.width) &&
        viewport.width > 0 &&
        Number.isFinite(viewport.height) &&
        viewport.height > 0,
      `previewViewports.${name} must have positive dimensions`,
    );
  }
  assert(
    Object.keys(value.previewViewports ?? {}).join(",") ===
      "homeSmall,homeMedium,accessoryRectangular",
    "preview viewports must expose the canonical widget families in order",
  );
  assert(
    Object.keys(value.previewPalette ?? {}).join(",") === "light,dark",
    "preview palette must expose light and dark schemes in order",
  );
  for (const [scheme, palette] of Object.entries(value.previewPalette ?? {})) {
    assert(
      Object.values(palette).every(
        (color) => typeof color === "string" && /^#[0-9A-Fa-f]{6}$/.test(color),
      ),
      `previewPalette.${scheme} must contain concrete six-digit colors`,
    );
    assert(
      Object.keys(palette).join(",") ===
        "surface,raisedSurface,textHigh,textMedium,textLow,textWeekend,accent,onAccent,heatmapBase,heatmapEmpty,todayIndicator",
      `previewPalette.${scheme} must expose every semantic renderer color role in order`,
    );
  }
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(
      value.previewFixture?.heatmap?.anchorDate ?? "",
    ) &&
      value.previewFixture.heatmap.durationPatternSeconds.length > 0 &&
      value.previewFixture.heatmap.durationPatternSeconds.every(
        (seconds) => Number.isInteger(seconds) && seconds >= 0,
      ),
    "preview heatmap fixture must have a stable anchor date and duration pattern",
  );
  assert(
    value.previewFixture?.routineProgress?.items?.length ===
      value.routineProgress?.textList?.visibleItemLimit &&
      value.previewFixture.routineProgress.currentIndex >= 0 &&
      value.previewFixture.routineProgress.currentIndex <
        value.previewFixture.routineProgress.items.length,
    "preview routine fixture must match the canonical visible item limit",
  );
  assert(
    value.previewFixture?.bodyPartDuration?.length ===
      value.bodyPartDuration?.visibleItemLimit,
    "preview body-part fixture must match the canonical visible item limit",
  );
  assert(
    value.control?.verticalDistribution === "spaceBetween",
    "small control widget regions must use responsive space-between distribution",
  );
  assert(
    Object.values(value.control?.copy ?? {}).every(
      (copy) => typeof copy === "string" && copy.length > 0,
    ),
    "control copy must contain non-empty strings",
  );
  for (const [name, scale] of [
    ["control title", value.control?.text?.title?.minimumScaleFactor],
    ["control timer", value.control?.text?.timer?.minimumScaleFactor],
    ["Live Activity banner title", value.liveActivity?.banner?.titleMinimumScaleFactor],
    ["Live Activity minimal", value.liveActivity?.minimal?.minimumScaleFactor],
    ["lock-screen inline", value.lockScreen?.text?.inline?.minimumScaleFactor],
    ["lock-screen circular", value.lockScreen?.text?.circular?.minimumScaleFactor],
    ["lock-screen rectangular title", value.lockScreen?.text?.rectangularTitle?.minimumScaleFactor],
    ["lock-screen rectangular detail", value.lockScreen?.text?.rectangularDetail?.minimumScaleFactor],
  ]) {
    assert(scale > 0 && scale <= 1, `${name} minimum scale must be in (0, 1]`);
  }
  for (const legacySlot of [
    "headerHeight",
    "bodyHeight",
    "footerWithRangeHeight",
  ]) {
    assert(
      value.control[legacySlot] === undefined,
      `control.${legacySlot} must not reserve a fixed region height`,
    );
  }

  const routineProgress = value.routineProgress;
  const routineProgressTextList = routineProgress?.textList;
  assert(
    routineProgressTextList?.availability === "native" &&
      routineProgressTextList.kindAccessor === "routineProgress" &&
      routineProgressTextList.family === "systemSmall",
    "routine progress text list must remain a native systemSmall widget",
  );
  assert(
    routineProgressTextList.progressBasis === "nextSplitPosition" &&
      routineProgressTextList.orientation === "vertical" &&
      routineProgressTextList.verticalDistribution === "spaceBetween" &&
      routineProgressTextList.visibleItemLimit === 3 &&
      routineProgressTextList.visibleItemSelection === "currentCentered",
    "routine progress text list must use next-split position and space-between distribution",
  );
  assert(
    routineProgressTextList.currentTextColorRole === "accent" &&
      routineProgressTextList.nonCurrentTextColorRole === "textLow" &&
      routineProgressTextList.rowContent?.join(",") ===
        "split,relativeDay,bodyParts,duration",
    "routine progress text list must accent the current split, mute other splits, and show split, relative day, body parts, duration",
  );
  const routineProgressLockScreen = routineProgressTextList.lockScreen;
  assert(
    routineProgressLockScreen?.availability === "native" &&
      routineProgressLockScreen.kindAccessor === "lockScreenRoutineProgress" &&
      routineProgressLockScreen.family === "accessoryRectangular" &&
      routineProgressLockScreen.orientation === "horizontal",
    "lock-screen routine progress must remain a preview-only horizontal accessoryRectangular widget",
  );
  assert(
    routineProgressLockScreen.visibleItemLimit === 3 &&
      routineProgressLockScreen.visibleItemSelection === "currentCentered" &&
      routineProgressLockScreen.progressBasis === "nextSplitPosition" &&
      routineProgressLockScreen.horizontalAlignment === "center" &&
      routineProgressLockScreen.rowContent?.join(",") ===
        "workoutAliasOrBodyParts,relativeDay",
    "lock-screen routine progress must center three workout aliases or body parts with relative days",
  );
  assert(
    routineProgressLockScreen.currentTextColorRole === "textHigh" &&
      routineProgressLockScreen.nonCurrentTextColorRole === "textLow",
    "lock-screen routine progress must emphasize only the current split",
  );

  const lockScreenCalendar = value.lockScreen?.threeWeekCalendar;
  assert(
    lockScreenCalendar?.availability === "native" &&
      lockScreenCalendar.kindAccessor === "lockScreenThreeWeekCalendar" &&
      lockScreenCalendar.family === "accessoryRectangular",
    "three-week lock-screen calendar must remain a native accessoryRectangular widget",
  );
  assert(
    lockScreenCalendar.rangeWeeks === 3 &&
      lockScreenCalendar.calendarAlignment === "completeCalendarWeeks" &&
      lockScreenCalendar.columns === 7,
    "lock-screen calendar must show three complete Sunday-first calendar weeks",
  );
  assert(
    lockScreenCalendar.dimmedWeekdayLabels?.join(",") === "일,토" &&
      lockScreenCalendar.dimmedWeekdayLabels.every((label) =>
        value.heatmap.weekdayLabels.includes(label),
      ) &&
      lockScreenCalendar.dimmedWeekdayOpacity > 0 &&
      lockScreenCalendar.dimmedWeekdayOpacity < 1,
    "lock-screen calendar must dim the Sunday and Saturday labels",
  );
  assert(
    lockScreenCalendar.bucketOpacities?.length === 4 &&
      lockScreenCalendar.bucketOpacities.every(
        (opacity, index, values) =>
          opacity > 0 &&
          opacity <= 1 &&
          (index === 0 || opacity > values[index - 1]),
      ) &&
      lockScreenCalendar.emptyCellFill === "transparent",
    "lock-screen calendar heat levels must use four increasing opacities and transparent empty cells",
  );
  assert(
    lockScreenCalendar.todayIndicator?.style === "border" &&
      lockScreenCalendar.todayIndicator.color === "#FFFFFF" &&
      lockScreenCalendar.todayIndicator.width > 0,
    "lock-screen calendar must outline today with a white border",
  );
  const nextLockScreenCalendar = value.lockScreen?.nextThreeWeekCalendar;
  assert(
    nextLockScreenCalendar?.availability === "native" &&
      nextLockScreenCalendar.kindAccessor ===
        "lockScreenNextThreeWeekCalendar" &&
      nextLockScreenCalendar.family === "accessoryRectangular",
    "next-three-week lock-screen calendar must remain a native accessoryRectangular widget",
  );
  assert(
    nextLockScreenCalendar.rangeWeeks === 3 &&
      nextLockScreenCalendar.calendarAlignment ===
        "upcomingCompleteCalendarWeeks" &&
      nextLockScreenCalendar.columns === 7 &&
      nextLockScreenCalendar.sharedStyle === "threeWeekCalendar",
    "next-three-week lock-screen calendar must show the current and following two weeks",
  );

  const bodyPartDuration = value.bodyPartDuration;
  assert(
    bodyPartDuration?.availability === "native" &&
      bodyPartDuration.kindAccessor === "bodyPartDuration" &&
      bodyPartDuration.family === "systemSmall",
    "body part duration must remain a native systemSmall widget",
  );
  assert(
    bodyPartDuration.rangeDays === 30 &&
      bodyPartDuration.durationAttribution === "fullSessionPerBodyPart",
    "body part duration must cover 30 days and attribute the full session to each body part",
  );
  assert(
    bodyPartDuration.sort === "durationDescending" &&
      bodyPartDuration.visibleItemLimit === 4 &&
      bodyPartDuration.verticalDistribution === "spaceBetween",
    "body part duration must show four descending items with space-between distribution",
  );

  const variants = value.heatmap?.variants;
  assert(
    variants && Object.keys(variants).join(",") === "week,month,year",
    "heatmap variants must be week, month, and year in that order",
  );
  assert(
    value.heatmap.weekdayLabels?.length === 7,
    "heatmap must have seven weekday labels",
  );
  assert(
    value.heatmap.bucketThresholdSeconds?.length === 3 &&
      value.heatmap.bucketThresholdSeconds.every(
        (threshold, index, thresholds) =>
          Number.isInteger(threshold) &&
          threshold > 0 &&
          (index === 0 || threshold > thresholds[index - 1]),
      ),
    "heatmap bucket thresholds must contain three increasing positive durations",
  );
  assert(
    value.heatmap.bucketAccentWeights?.length === 4 &&
      value.heatmap.bucketAccentWeights.every(
        (weight, index, weights) =>
          weight > 0 &&
          weight <= 1 &&
          (index === 0 || weight > weights[index - 1]),
      ) &&
      value.heatmap.bucketAccentWeights.at(-1) === 1,
    "heatmap bucket weights must contain four increasing weights ending at 1",
  );
  assert(
    value.heatmap.weekdayLabelHeightInCells === 1,
    "heatmap weekday label height must match one grid cell",
  );
  const weekdayLabelColorPolicy = value.heatmap.weekdayLabelColorPolicy;
  assert(
    weekdayLabelColorPolicy?.weekendLabels?.length === 2 &&
      weekdayLabelColorPolicy.weekendLabels.every((label) =>
        value.heatmap.weekdayLabels.includes(label),
      ),
    "heatmap weekend labels must contain two known weekday labels",
  );
  assert(
    weekdayLabelColorPolicy.weekendRole === "textWeekend",
    "heatmap weekend labels must use the textWeekend role",
  );
  assert(variants.week.rangeDays === 7, "week range must be seven days");
  assert(
    variants.month.rangeDays === 0,
    "five-week range must not use rolling days",
  );
  assert(
    variants.month.rangeWeeks === 5,
    "month variant must cover five calendar weeks",
  );
  assert(
    variants.month.showLeadingCalendarCells === false,
    "five-week range has no leading cells",
  );
  for (const key of [
    "columns",
    "contentPadding",
    "cellGap",
    "cellRadius",
    "cellLabelSize",
  ]) {
    assert(
      variants.week[key] === variants.month[key],
      `week and five-week heatmaps must share ${key}`,
    );
  }
  assert(
    variants.year.rangeMonths === 6,
    "year variant must represent six months",
  );
  const cellLabelColorPolicy = value.heatmap.cellLabelColorPolicy;
  const cellLabelColorRoles = ["textLow", "textHigh", "onAccent"];
  assert(cellLabelColorPolicy, "heatmap.cellLabelColorPolicy is required");
  for (const key of ["empty", "filled", "strongFilled"]) {
    assert(
      cellLabelColorRoles.includes(cellLabelColorPolicy[key]),
      `heatmap.cellLabelColorPolicy.${key} is not supported`,
    );
  }
  assert(
    Number.isInteger(cellLabelColorPolicy.strongMinimumBucket) &&
      cellLabelColorPolicy.strongMinimumBucket > 0,
    "heatmap.cellLabelColorPolicy.strongMinimumBucket must be a positive integer",
  );
  assert(
    Number.isInteger(cellLabelColorPolicy.strongMinimumDurationSeconds) &&
      cellLabelColorPolicy.strongMinimumDurationSeconds > 0,
    "heatmap.cellLabelColorPolicy.strongMinimumDurationSeconds must be a positive integer",
  );
  assert(
    variants.year.monthBoundaryGapSlots === 7,
    "six-month month boundaries must insert one seven-slot column",
  );
  assert(
    variants.week.headerVisible === false,
    "week header must remain hidden",
  );
  assert(
    variants.week.style === "detailed",
    "week must use the detailed heatmap style",
  );
  assert(
    variants.month.style === "detailed",
    "five weeks must use the detailed heatmap style",
  );
  assert(
    variants.year.style === "compact",
    "six months must use the compact heatmap style",
  );
  const currentMonthPreview = value.heatmap.previewVariants?.currentMonth;
  assert(
    currentMonthPreview?.style === "detailed" &&
      currentMonthPreview.availability === "native" &&
      currentMonthPreview.kindAccessor === "currentMonthCalendar" &&
      currentMonthPreview.family === "systemSmall" &&
      currentMonthPreview.headerSummary === "count" &&
      currentMonthPreview.maxRows === 6 &&
      currentMonthPreview.outsideMonthCells === "dateLabelOnly",
    "current-month preview must use the detailed style with a count summary and up to six rows",
  );
  assert(
    currentMonthPreview.todayIndicator?.style === "border" &&
      currentMonthPreview.todayIndicator.colorRole === "todayIndicator" &&
      currentMonthPreview.todayIndicator.width > 0,
    "current-month preview must use the theme-aware today indicator border",
  );
  const fourWeekExpandedPreview =
    value.heatmap.previewVariants?.fourWeekExpanded;
  assert(
    fourWeekExpandedPreview?.style === "expanded" &&
      fourWeekExpandedPreview.availability === "native" &&
      fourWeekExpandedPreview.kindAccessor === "heatmapFourWeekExpanded" &&
      fourWeekExpandedPreview.family === "systemMedium",
    "expanded four-week heatmap must remain a native systemMedium widget",
  );
  assert(
    fourWeekExpandedPreview.rangeWeeks === 4 &&
      fourWeekExpandedPreview.calendarAlignment === "calendarWeeks",
    "expanded four-week heatmap must cover four calendar weeks",
  );
  assert(
    fourWeekExpandedPreview.cellContent === "dayAndBodyParts" &&
      fourWeekExpandedPreview.bodyPartMaxLines === 1,
    "expanded four-week heatmap must show one line of body parts below each day",
  );
  assert(
    Object.values(variants).every(
      (variant) => variant.contentPadding === value.designSystem.contentPadding,
    ),
    "home-screen heatmaps must share the canonical content padding",
  );
  const headerSummaries = ["none", "count", "countTotalAverage"];
  const calendarAlignments = [
    "rollingDays",
    "calendarWeeks",
    "continuousMonthsWithBoundarySlots",
  ];
  for (const [name, variant] of Object.entries(variants)) {
    assert(
      variant.contentPadding > 0,
      `${name}.contentPadding must be positive`,
    );
    assert(
      headerSummaries.includes(variant.headerSummary),
      `${name}.headerSummary is not supported`,
    );
    assert(
      calendarAlignments.includes(variant.calendarAlignment),
      `${name}.calendarAlignment is not supported`,
    );
    assert(
      Number.isInteger(variant.rangeWeeks) && variant.rangeWeeks >= 0,
      `${name}.rangeWeeks must be a non-negative integer`,
    );
    assert(
      variant.headerVisible === (variant.headerSummary !== "none"),
      `${name}.headerVisible must agree with headerSummary`,
    );
  }
  assert(
    variants.week.calendarAlignment === "rollingDays",
    "week must use a rolling calendar",
  );
  assert(
    variants.month.calendarAlignment === "calendarWeeks",
    "month must use a fixed calendar-week window",
  );
  assert(
    variants.year.calendarAlignment === "continuousMonthsWithBoundarySlots",
    "six months must use continuous month boundary slots",
  );

  const footer = value.heatmap.weekFooter;
  assert(
    footer.statOrder?.join(",") === "count,totalDuration,averageDuration",
    "week footer stat order must be count, total duration, average duration",
  );
  assert(
    footer.statOrder.length === footer.statLabels?.length,
    "week footer labels must match stats",
  );
  assert(
    footer.alwaysShowRecent === true,
    "week recent section must always be visible",
  );
  const monthFooter = value.heatmap.monthFooter;
  assert(
    monthFooter?.statOrder?.join(",") === "count,totalDuration",
    "month footer stat order must be count, total duration",
  );
  assert(
    typeof monthFooter.separator === "string",
    "month footer separator must be a string",
  );
  assert(
    typeof monthFooter.totalDurationPrefix === "string",
    "month footer total duration prefix must be a string",
  );
  const compact = value.liveActivity?.compact;
  assert(compact, "liveActivity.compact is required");
  for (const [name, dimension] of Object.entries(compact)) {
    assert(
      Number.isFinite(dimension) && dimension > 0,
      `liveActivity.compact.${name} must be positive`,
    );
  }
  assert(
    compact.leadingWidth === compact.trailingWidth,
    "compact Live Activity leading and trailing widths must be balanced",
  );

  const expanded = value.liveActivity?.expanded;
  assert(expanded, "liveActivity.expanded is required");
  assert(
    expanded.regions?.title === "leading" &&
      expanded.regions?.timer === "center" &&
      expanded.regions?.endButton === "trailing",
    "expanded Live Activity regions must be leading, center, and trailing",
  );
  assert(
    expanded.sideRegionVerticalAlignment === "center",
    "expanded Live Activity side regions must be vertically centered",
  );
  assert(
    expanded.timerHorizontalAlignment === "trailing",
    "expanded Live Activity timer must use trailing alignment",
  );
  for (const [name, dimension] of Object.entries(expanded)) {
    if (name !== "regions" && !name.endsWith("Alignment")) {
      assert(
        Number.isFinite(dimension) && dimension > 0,
        `liveActivity.expanded.${name} must be positive`,
      );
    }
  }
}

function renderAndroidWidgetProviderOutputs(value, rootDirectory) {
  const xmlDirectory = path.join(
    rootDirectory,
    "modules/loofit-workout-core/android/src/main/res/xml",
  );
  const providers = [
    ["control", "control", "control", "control", "homeSmall", "home_screen"],
    ["week", "week", "static", "week", "homeSmall", "home_screen"],
    ["month", "month", "static", "month", "homeSmall", "home_screen"],
    ["six_months", "six_months", "static", "six_months", "homeMedium", "home_screen"],
    ["current_month", "current_month", "static", "current_month", "homeSmall", "home_screen"],
    ["four_week", "four_week", "static", "four_week", "homeMedium", "home_screen"],
    ["routine_progress", "routine_progress", "static", "routine_progress", "homeSmall", "home_screen"],
    ["body_part_duration", "body_part_duration", "static", "body_part_duration", "homeSmall", "home_screen"],
    ["lock_workout", "lock_workout", "lock_control", "lock_workout", "accessoryRectangular", "home_screen|keyguard"],
    ["lock_three_week", "lock_three_week", "static", "lock_three_week", "accessoryRectangular", "home_screen|keyguard"],
    ["lock_next_three_week", "lock_next_three_week", "static", "lock_next_three_week", "accessoryRectangular", "home_screen|keyguard"],
    ["lock_routine_progress", "lock_routine_progress", "static", "lock_routine_progress", "accessoryRectangular", "home_screen|keyguard"],
  ];

  return providers.map(
    ([filename, description, initialLayout, previewLayout, family, category]) => {
      const sizing = value.platformPolicy.android.providerSizing[family];
      const contents = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/generate-widget-renderer-contract.mjs. Do not edit. -->
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:description="@string/loofit_widget_${description}_description"
  android:initialLayout="@layout/loofit_widget_${initialLayout}"
  android:minWidth="${sizing.minWidth}dp"
  android:minHeight="${sizing.minHeight}dp"
  android:previewLayout="@layout/loofit_widget_preview_${previewLayout}"
  android:resizeMode="horizontal|vertical"
  android:targetCellWidth="${sizing.targetCellWidth}"
  android:targetCellHeight="${sizing.targetCellHeight}"
  android:updatePeriodMillis="1800000"
  android:widgetCategory="${category}" />
`;
      return [path.join(xmlDirectory, `loofit_widget_${filename}_info.xml`), contents];
    },
  );
}

function validateTokenSource(value) {
  const designSystem = value.designSystem;
  assert(designSystem?.spacing, "designSystem.spacing is required");
  assert(designSystem?.radius, "designSystem.radius is required");
  assert(designSystem?.typography, "designSystem.typography is required");
  assert(designSystem?.fontWeight, "designSystem.fontWeight is required");
  assert(designSystem?.opacity, "designSystem.opacity is required");
  assert(designSystem?.minimumScale, "designSystem.minimumScale is required");
  assert(designSystem?.colorRoles, "designSystem.colorRoles is required");

  for (const [name, spacing] of Object.entries(designSystem.spacing)) {
    assert(
      Number.isFinite(spacing) && spacing >= 0,
      `designSystem.spacing.${name} must be non-negative`,
    );
  }
  for (const [name, radius] of Object.entries(designSystem.radius)) {
    assert(
      Number.isFinite(radius) && radius >= 0,
      `designSystem.radius.${name} must be non-negative`,
    );
  }
  assert(
    Object.keys(designSystem.spacing).join(",") === "xs,sm,md,lg",
    "designSystem.spacing must contain only xs, sm, md, and lg",
  );
  assert(
    Object.keys(designSystem.radius).join(",") === "cell,control,container",
    "designSystem.radius must contain only cell, control, and container",
  );
  assert(
    Object.keys(designSystem.typography).join(",") === "sm,md,lg,xl",
    "designSystem.typography must contain only sm, md, lg, and xl",
  );
  for (const [name, typography] of Object.entries(designSystem.typography)) {
    assert(
      typography.size > 0,
      `designSystem.typography.${name}.size must be positive`,
    );
    assert(
      typography.lineHeight >= typography.size,
      `designSystem.typography.${name}.lineHeight must fit its font size`,
    );
  }
  assert(
    Object.keys(designSystem.fontWeight).join(",") === "bold,medium,light" &&
      Object.values(designSystem.fontWeight).join(",") === "800,700,600",
    "designSystem.fontWeight must contain bold 800, medium 700, and light 600",
  );
  for (const [name, opacity] of Object.entries(designSystem.opacity)) {
    assert(
      opacity > 0 && opacity <= 1,
      `designSystem.opacity.${name} must be in (0, 1]`,
    );
  }
  for (const [name, scale] of Object.entries(designSystem.minimumScale)) {
    assert(
      scale > 0 && scale <= 1,
      `designSystem.minimumScale.${name} must be in (0, 1]`,
    );
  }

  const expectedColorRoles = [
    "surface",
    "raisedSurface",
    "textHigh",
    "textMedium",
    "textLow",
    "textWeekend",
    "todayIndicator",
    "accent",
    "onAccent",
    "heatmapBase",
    "heatmapEmpty",
  ];
  assert(
    Object.keys(designSystem.colorRoles).join(",") ===
      expectedColorRoles.join(","),
    "designSystem.colorRoles must expose the canonical semantic roles in order",
  );

  for (const path of [
    ["card", "radius"],
    ["card", "contentPadding"],
    ["card", "contentGap"],
    ["heatmap", "styles", "detailed", "contentPadding"],
    ["heatmap", "styles", "detailed", "cellGap"],
    ["heatmap", "styles", "detailed", "cellRadius"],
    ["heatmap", "styles", "detailed", "cellLabelMinimumScaleFactor"],
    ["heatmap", "styles", "detailed", "headerLineHeight"],
    ["heatmap", "styles", "detailed", "headerMinimumScaleFactor"],
    ["heatmap", "styles", "expanded", "contentPadding"],
    ["heatmap", "styles", "expanded", "cellGap"],
    ["heatmap", "styles", "expanded", "cellRadius"],
    ["heatmap", "styles", "expanded", "cellLabelSize"],
    ["heatmap", "styles", "expanded", "cellLabelMinimumScaleFactor"],
    ["heatmap", "styles", "expanded", "cellLabelLineHeight"],
    ["heatmap", "styles", "expanded", "bodyPartLabelSize"],
    ["heatmap", "styles", "expanded", "bodyPartLabelLineHeight"],
    ["heatmap", "styles", "expanded", "bodyPartLabelOpacity"],
    ["heatmap", "styles", "expanded", "cellContentGap"],
    ["heatmap", "styles", "expanded", "weekdayHeaderHeight"],
    ["heatmap", "styles", "expanded", "headerGap"],
    ["heatmap", "styles", "expanded", "headerFontSize"],
    ["heatmap", "styles", "expanded", "headerLineHeight"],
    ["heatmap", "styles", "expanded", "headerMinimumScaleFactor"],
    ["heatmap", "styles", "compact", "contentPadding"],
    ["heatmap", "styles", "compact", "cellGap"],
    ["heatmap", "styles", "compact", "cellRadius"],
    ["heatmap", "styles", "compact", "cellLabelMinimumScaleFactor"],
    ["heatmap", "styles", "compact", "headerLineHeight"],
    ["heatmap", "styles", "compact", "headerMinimumScaleFactor"],
    ["control", "text", "title", "minimumScaleFactor"],
    ["control", "text", "timer", "minimumScaleFactor"],
    ["liveActivity", "banner", "titleMinimumScaleFactor"],
    ["liveActivity", "minimal", "minimumScaleFactor"],
    ["lockScreen", "text", "inline", "minimumScaleFactor"],
    ["lockScreen", "text", "circular", "minimumScaleFactor"],
    ["lockScreen", "text", "circular", "horizontalPadding"],
    ["lockScreen", "text", "rectangularTitle", "minimumScaleFactor"],
    ["lockScreen", "text", "rectangularDetail", "minimumScaleFactor"],
    ["lockScreen", "threeWeekCalendar", "cellLabelMinimumScaleFactor"],
    ["routineProgress", "textList", "contentPadding"],
    ["routineProgress", "textList", "text", "split", "size"],
    ["routineProgress", "textList", "text", "split", "lineHeight"],
    ["routineProgress", "textList", "text", "split", "weight"],
    ["routineProgress", "textList", "text", "metadata", "size"],
    ["routineProgress", "textList", "text", "metadata", "lineHeight"],
    ["routineProgress", "textList", "text", "metadata", "weight"],
    ["routineProgress", "textList", "lockScreen", "contentPadding"],
    ["routineProgress", "textList", "lockScreen", "columnGap"],
    ["routineProgress", "textList", "lockScreen", "itemGap"],
    ["routineProgress", "textList", "lockScreen", "text", "workout", "size"],
    [
      "routineProgress",
      "textList",
      "lockScreen",
      "text",
      "workout",
      "lineHeight",
    ],
    ["routineProgress", "textList", "lockScreen", "text", "workout", "weight"],
    [
      "routineProgress",
      "textList",
      "lockScreen",
      "text",
      "relativeDay",
      "size",
    ],
    [
      "routineProgress",
      "textList",
      "lockScreen",
      "text",
      "relativeDay",
      "lineHeight",
    ],
    [
      "routineProgress",
      "textList",
      "lockScreen",
      "text",
      "relativeDay",
      "weight",
    ],
    ["bodyPartDuration", "contentPadding"],
    ["bodyPartDuration", "bar", "height"],
    ["bodyPartDuration", "bar", "radius"],
    ["bodyPartDuration", "text", "title", "size"],
    ["bodyPartDuration", "text", "title", "lineHeight"],
    ["bodyPartDuration", "text", "title", "weight"],
    ["bodyPartDuration", "text", "bodyPart", "size"],
    ["bodyPartDuration", "text", "bodyPart", "lineHeight"],
    ["bodyPartDuration", "text", "bodyPart", "weight"],
    ["bodyPartDuration", "text", "duration", "size"],
    ["bodyPartDuration", "text", "duration", "lineHeight"],
    ["bodyPartDuration", "text", "duration", "weight"],
    ["platformPolicy", "android", "accessoryPreviewBackdrop", "radius"],
  ]) {
    const raw = valueAtPath(value, path);
    assert(
      isTokenReference(raw),
      `${path.join(".")} must reference a design token`,
    );
  }
}

function applyComponentRecipes(value) {
  const styles = value.heatmap.styles;
  const variants = Object.fromEntries(
    Object.entries(value.heatmap.variants).map(([name, variant]) => {
      const style = styles[variant.style];
      assert(style, `unknown heatmap style for ${name}: ${variant.style}`);
      return [name, { ...style, ...variant }];
    }),
  );
  const previewVariants = Object.fromEntries(
    Object.entries(value.heatmap.previewVariants).map(([name, variant]) => {
      const style = styles[variant.style];
      assert(
        style,
        `unknown heatmap preview style for ${name}: ${variant.style}`,
      );
      return [name, { ...style, ...variant }];
    }),
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
      assert(
        !stack.includes(tokenPath),
        `circular design token reference: ${[...stack, tokenPath].join(" -> ")}`,
      );
      const token = valueAtPath(tokenRoot, tokenPath.split("."));
      assert(token !== undefined, `unknown design token reference: ${value}`);
      return resolve(token, [...stack, tokenPath]);
    }
    if (Array.isArray(value)) {
      return value.map((item) => resolve(item, stack));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, resolve(item, stack)]),
      );
    }
    return value;
  }

  return resolve(source);
}

function isTokenReference(value) {
  return typeof value === "string" && /^\{[A-Za-z0-9_.-]+\}$/.test(value);
}

function valueAtPath(value, path) {
  return path.reduce(
    (current, key) =>
      current && typeof current === "object" ? current[key] : undefined,
    value,
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Invalid widget renderer contract: ${message}`);
  }
}

function renderTypeScript(value, fingerprint) {
  return (
    `// Generated by scripts/generate-widget-renderer-contract.mjs. Do not edit.\n` +
    `// Edit src/widgets/widget-renderer-contract.json and regenerate instead.\n\n` +
    `export const WIDGET_RENDERER_CONTRACT_FINGERPRINT = ${JSON.stringify(fingerprint)};\n\n` +
    `export const WIDGET_RENDERER_CONTRACT = ${JSON.stringify(value, null, 2)} as const;\n\n` +
    `export type WidgetRendererContract = typeof WIDGET_RENDERER_CONTRACT;\n`
  );
}

function renderSwift(value, fingerprint) {
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
      cellLabelMinimumScaleFactor: ${swiftNumber(variant.cellLabelMinimumScaleFactor)},
      headerGap: ${swiftNumber(variant.headerGap)},
      headerVisible: ${variant.headerVisible},
      headerFontSize: ${swiftNumber(variant.headerFontSize)},
      headerLineHeight: ${swiftNumber(variant.headerLineHeight)},
      headerMinimumScaleFactor: ${swiftNumber(variant.headerMinimumScaleFactor)},
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
  const lockScreenCalendar = lock.threeWeekCalendar;
  const nextLockScreenCalendar = lock.nextThreeWeekCalendar;
  const banner = value.liveActivity.banner;
  const compact = value.liveActivity.compact;
  const minimal = value.liveActivity.minimal;
  const expanded = value.liveActivity.expanded;
  const fontWeight = value.designSystem.fontWeight;
  const contentMargins = value.contentMargins;
  const previewViewports = value.previewViewports;

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
  let cellLabelMinimumScaleFactor: CGFloat
  let headerGap: CGFloat
  let headerVisible: Bool
  let headerFontSize: CGFloat
  let headerLineHeight: CGFloat
  let headerMinimumScaleFactor: CGFloat
  let headerSummary: LoofitHeatmapHeaderSummary
  let calendarAlignment: LoofitHeatmapCalendarAlignment
  let showLeadingCalendarCells: Bool
  let monthBoundaryGapSlots: Int
  let reservedHeaderHeight: CGFloat
  let reservedFooterHeight: CGFloat
}

enum LoofitWidgetRendererContract {
  static let version = ${value.version}
  static let fingerprint = ${swiftString(fingerprint)}
  static let contentPadding: CGFloat = ${swiftNumber(value.card.contentPadding)}

  enum ContentMargins {
    static let homeReferenceShortestEdge: CGFloat = ${swiftNumber(contentMargins.home.referenceShortestEdge)}
  }

  enum PreviewViewports {
    static let homeSmall = CGSize(width: ${swiftNumber(previewViewports.homeSmall.width)}, height: ${swiftNumber(previewViewports.homeSmall.height)})
    static let homeMedium = CGSize(width: ${swiftNumber(previewViewports.homeMedium.width)}, height: ${swiftNumber(previewViewports.homeMedium.height)})
    static let accessoryRectangular = CGSize(width: ${swiftNumber(previewViewports.accessoryRectangular.width)}, height: ${swiftNumber(previewViewports.accessoryRectangular.height)})
  }

  enum PreviewData {
    static let paletteJSON = ${swiftString(JSON.stringify(value.previewPalette))}
    static let fixtureJSON = ${swiftString(JSON.stringify(value.previewFixture))}
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
    static let compact: CGFloat = ${swiftNumber(value.designSystem.minimumScale.compact)}
    static let calendar: CGFloat = ${swiftNumber(value.designSystem.minimumScale.calendar)}
    static let display: CGFloat = ${swiftNumber(value.designSystem.minimumScale.display)}
    static let dense: CGFloat = ${swiftNumber(value.designSystem.minimumScale.dense)}
    static let timer: CGFloat = ${swiftNumber(value.designSystem.minimumScale.timer)}
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
    static let titleMinimumScaleFactor: CGFloat = ${swiftNumber(control.text.title.minimumScaleFactor)}
    static let timerSize: CGFloat = ${swiftNumber(control.text.timer.size)}
    static let timerMinimumScaleFactor: CGFloat = ${swiftNumber(control.text.timer.minimumScaleFactor)}
    static let detailSize: CGFloat = ${swiftNumber(control.text.detail.size)}
    static let buttonTextSize: CGFloat = ${swiftNumber(control.text.button.size)}
    static let durationSize: CGFloat = ${swiftNumber(control.text.duration.size)}
    static let rangeSize: CGFloat = ${swiftNumber(control.text.range.size)}

    enum Copy {
      static let idle = ${swiftString(control.copy.idle)}
      static let active = ${swiftString(control.copy.active)}
      static let completed = ${swiftString(control.copy.completed)}
      static let start = ${swiftString(control.copy.start)}
      static let end = ${swiftString(control.copy.end)}
      static let routineRequired = ${swiftString(control.copy.routineRequired)}
    }
  }

  enum CurrentMonth {
    static let contentPadding: CGFloat = ${swiftNumber(currentMonth.contentPadding)}
    static let cellGap: CGFloat = ${swiftNumber(currentMonth.cellGap)}
    static let cellRadius: CGFloat = ${swiftNumber(currentMonth.cellRadius)}
    static let cellLabelSize: CGFloat = ${swiftNumber(currentMonth.cellLabelSize)}
    static let cellLabelMinimumScaleFactor: CGFloat = ${swiftNumber(currentMonth.cellLabelMinimumScaleFactor)}
    static let headerGap: CGFloat = ${swiftNumber(currentMonth.headerGap)}
    static let headerFontSize: CGFloat = ${swiftNumber(currentMonth.headerFontSize)}
    static let headerLineHeight: CGFloat = ${swiftNumber(currentMonth.headerLineHeight)}
    static let headerMinimumScaleFactor: CGFloat = ${swiftNumber(currentMonth.headerMinimumScaleFactor)}
    static let outsideMonthDateLabelOnly = ${currentMonth.outsideMonthCells === "dateLabelOnly"}
    static let todayIndicatorWidth: CGFloat = ${swiftNumber(currentMonth.todayIndicator.width)}
  }

  enum FourWeekExpanded {
    static let rangeWeeks = ${fourWeekExpanded.rangeWeeks}
    static let columns = ${fourWeekExpanded.columns}
    static let contentPadding: CGFloat = ${swiftNumber(fourWeekExpanded.contentPadding)}
    static let cellGap: CGFloat = ${swiftNumber(fourWeekExpanded.cellGap)}
    static let cellRadius: CGFloat = ${swiftNumber(fourWeekExpanded.cellRadius)}
    static let cellLabelSize: CGFloat = ${swiftNumber(fourWeekExpanded.cellLabelSize)}
    static let cellLabelMinimumScaleFactor: CGFloat = ${swiftNumber(fourWeekExpanded.cellLabelMinimumScaleFactor)}
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
      static let titleMinimumScaleFactor: CGFloat = ${swiftNumber(banner.titleMinimumScaleFactor)}
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
      static let minimumScaleFactor: CGFloat = ${swiftNumber(minimal.minimumScaleFactor)}
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
    static let bucketThresholdSeconds = ${swiftNumberArray(value.heatmap.bucketThresholdSeconds)}
    static let bucketAccentWeights = ${swiftNumberArray(value.heatmap.bucketAccentWeights)}
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
      static let statValueMinimumScale: CGFloat = ${swiftNumber(footer.statValueMinimumScale)}
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
    static let compactCharacterLimit = ${lock.compactCharacterLimit}
    static let inlineFontSize: CGFloat = ${swiftNumber(lock.text.inline.size)}
    static let inlineMinimumScaleFactor: CGFloat = ${swiftNumber(lock.text.inline.minimumScaleFactor)}
    static let circularDefaultFontSize: CGFloat = ${swiftNumber(lock.text.circular.size)}
    static let circularCompletedFontSize: CGFloat = ${swiftNumber(lock.text.circular.size)}
    static let circularMinimumScaleFactor: CGFloat = ${swiftNumber(lock.text.circular.minimumScaleFactor)}
    static let circularHorizontalPadding: CGFloat = ${swiftNumber(lock.text.circular.horizontalPadding)}
    static let rectangularTitleFontSize: CGFloat = ${swiftNumber(lock.text.rectangularTitle.size)}
    static let rectangularTitleMinimumScaleFactor: CGFloat = ${swiftNumber(lock.text.rectangularTitle.minimumScaleFactor)}
    static let rectangularDetailFontSize: CGFloat = ${swiftNumber(lock.text.rectangularDetail.size)}
    static let rectangularDetailMinimumScaleFactor: CGFloat = ${swiftNumber(lock.text.rectangularDetail.minimumScaleFactor)}

    enum ThreeWeekCalendar {
      static let rangeWeeks = ${lockScreenCalendar.rangeWeeks}
      static let columns = ${lockScreenCalendar.columns}
      static let contentPadding: CGFloat = ${swiftNumber(lockScreenCalendar.contentPadding)}
      static let cellGap: CGFloat = ${swiftNumber(lockScreenCalendar.cellGap)}
      static let cellRadius: CGFloat = ${swiftNumber(lockScreenCalendar.cellRadius)}
      static let cellLabelSize: CGFloat = ${swiftNumber(lockScreenCalendar.cellLabelSize)}
      static let cellLabelMinimumScaleFactor: CGFloat = ${swiftNumber(lockScreenCalendar.cellLabelMinimumScaleFactor)}
      static let weekdayLabelSize: CGFloat = ${swiftNumber(lockScreenCalendar.weekdayLabelSize)}
      static let weekdayLabelLineHeight: CGFloat = ${swiftNumber(lockScreenCalendar.weekdayLabelLineHeight)}
      static let dimmedWeekdayLabels = ${swiftStringArray(lockScreenCalendar.dimmedWeekdayLabels)}
      static let dimmedWeekdayOpacity: Double = ${swiftNumber(lockScreenCalendar.dimmedWeekdayOpacity)}
      static let bucketOpacities: [Double] = ${swiftNumberArray(lockScreenCalendar.bucketOpacities)}
      static let todayIndicatorColor = ${swiftString(lockScreenCalendar.todayIndicator.color)}
      static let todayIndicatorWidth: CGFloat = ${swiftNumber(lockScreenCalendar.todayIndicator.width)}
    }
  }
}
`;
}

function renderCoreSwift(value, fingerprint) {
  const variants = value.heatmap.variants;
  const currentMonth = value.heatmap.previewVariants.currentMonth;
  const fourWeekExpanded = value.heatmap.previewVariants.fourWeekExpanded;
  const routineProgress = value.routineProgress.textList;
  const bodyPartDuration = value.bodyPartDuration;
  const lockScreenCalendar = value.lockScreen.threeWeekCalendar;
  const nextLockScreenCalendar = value.lockScreen.nextThreeWeekCalendar;
  const surfaceKinds = value.surfaceKinds;
  return `// Generated by scripts/generate-widget-renderer-contract.mjs. Do not edit.
// Edit src/widgets/widget-renderer-contract.json and regenerate instead.

public enum LoofitWidgetLayoutContract {
  public static let fingerprint = ${swiftString(fingerprint)}
  public static let calendarRows = ${value.heatmap.weekdayLabels.length}

  public enum SurfaceKinds {
    public static let control = ${swiftString(surfaceKinds.control)}
    public static let heatmapWeek = ${swiftString(surfaceKinds.heatmapWeek)}
    public static let heatmapMonth = ${swiftString(surfaceKinds.heatmapMonth)}
    public static let heatmapSixMonths = ${swiftString(surfaceKinds.heatmapSixMonths)}
    public static let currentMonth = ${swiftString(surfaceKinds.currentMonth)}
    public static let fourWeekExpanded = ${swiftString(surfaceKinds.fourWeekExpanded)}
    public static let routineProgress = ${swiftString(surfaceKinds.routineProgress)}
    public static let bodyPartDuration = ${swiftString(surfaceKinds.bodyPartDuration)}
    public static let lockWorkout = ${swiftString(surfaceKinds.lockWorkout)}
    public static let lockThreeWeek = ${swiftString(surfaceKinds.lockThreeWeek)}
    public static let lockNextThreeWeek = ${swiftString(surfaceKinds.lockNextThreeWeek)}
    public static let lockRoutineProgress = ${swiftString(surfaceKinds.lockRoutineProgress)}
    public static let all = [
      control,
      heatmapWeek,
      heatmapMonth,
      heatmapSixMonths,
      currentMonth,
      fourWeekExpanded,
      routineProgress,
      bodyPartDuration,
      lockWorkout,
      lockThreeWeek,
      lockNextThreeWeek,
      lockRoutineProgress,
    ]
  }

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
    public static let threeWeekCalendarRangeWeeks = ${lockScreenCalendar.rangeWeeks}
    public static let nextThreeWeekCalendarRangeWeeks = ${nextLockScreenCalendar.rangeWeeks}
  }
}
`;
}

function renderCoreKotlin(value, fingerprint) {
  const variants = value.heatmap.variants;
  const currentMonth = value.heatmap.previewVariants.currentMonth;
  const fourWeekExpanded = value.heatmap.previewVariants.fourWeekExpanded;
  const routineProgress = value.routineProgress.textList;
  const routineProgressLock = routineProgress.lockScreen;
  const bodyPartDuration = value.bodyPartDuration;
  const lockScreenCalendar = value.lockScreen.threeWeekCalendar;
  const nextLockScreenCalendar = value.lockScreen.nextThreeWeekCalendar;
  const androidPolicy = value.platformPolicy.android;
  const androidPreviewViewports = androidPolicy.previewViewports;
  const androidProviderSizing = androidPolicy.providerSizing;
  const surfaceKinds = value.surfaceKinds;
  const heatmapVariant = (variant) => `LoofitHeatmapRendererSpec(
      title = ${kotlinString(variant.title)},
      style = LoofitHeatmapStyle.${kotlinEnumCase(variant.style)},
      rangeDays = ${variant.rangeDays},
      rangeWeeks = ${variant.rangeWeeks},
      rangeMonths = ${variant.rangeMonths},
      columns = ${variant.columns},
      contentPadding = ${kotlinNumber(variant.contentPadding)}f,
      cellGap = ${kotlinNumber(variant.cellGap)}f,
      cellRadius = ${kotlinNumber(variant.cellRadius)}f,
      cellLabelSize = ${kotlinNumber(variant.cellLabelSize)}f,
      cellLabelMinimumScaleFactor = ${kotlinNumber(variant.cellLabelMinimumScaleFactor)}f,
      headerGap = ${kotlinNumber(variant.headerGap)}f,
      headerVisible = ${variant.headerVisible},
      headerFontSize = ${kotlinNumber(variant.headerFontSize)}f,
      headerLineHeight = ${kotlinNumber(variant.headerLineHeight)}f,
      headerMinimumScaleFactor = ${kotlinNumber(variant.headerMinimumScaleFactor)}f,
      headerSummary = LoofitHeatmapHeaderSummary.${kotlinEnumCase(variant.headerSummary)},
      calendarAlignment = LoofitHeatmapCalendarAlignment.${kotlinEnumCase(variant.calendarAlignment)},
      showLeadingCalendarCells = ${variant.showLeadingCalendarCells},
      monthBoundaryGapSlots = ${variant.monthBoundaryGapSlots},
      reservedHeaderHeight = ${kotlinNumber(variant.reservedHeaderHeight)}f,
      reservedFooterHeight = ${kotlinNumber(variant.reservedFooterHeight)}f,
    )`;
  return `// Generated by scripts/generate-widget-renderer-contract.mjs. Do not edit.
// Edit src/widgets/widget-renderer-contract.json and regenerate instead.

package com.loofit.workoutcore

internal enum class LoofitHeatmapStyle { DETAILED, EXPANDED, COMPACT }
internal enum class LoofitHeatmapHeaderSummary { NONE, COUNT, COUNT_TOTAL_AVERAGE }
internal enum class LoofitHeatmapCalendarAlignment {
  ROLLING_DAYS,
  CALENDAR_WEEKS,
  CONTINUOUS_MONTHS_WITH_BOUNDARY_SLOTS,
}
internal enum class LoofitHeatmapStat { COUNT, TOTAL_DURATION, AVERAGE_DURATION }

internal data class LoofitWidgetViewportSpec(val width: Float, val height: Float)

internal data class LoofitWidgetProviderSizeSpec(
  val minWidth: Int,
  val minHeight: Int,
  val targetCellWidth: Int,
  val targetCellHeight: Int,
)

internal data class LoofitHeatmapRendererSpec(
  val title: String,
  val style: LoofitHeatmapStyle,
  val rangeDays: Int,
  val rangeWeeks: Int,
  val rangeMonths: Int,
  val columns: Int,
  val contentPadding: Float,
  val cellGap: Float,
  val cellRadius: Float,
  val cellLabelSize: Float,
  val cellLabelMinimumScaleFactor: Float,
  val headerGap: Float,
  val headerVisible: Boolean,
  val headerFontSize: Float,
  val headerLineHeight: Float,
  val headerMinimumScaleFactor: Float,
  val headerSummary: LoofitHeatmapHeaderSummary,
  val calendarAlignment: LoofitHeatmapCalendarAlignment,
  val showLeadingCalendarCells: Boolean,
  val monthBoundaryGapSlots: Int,
  val reservedHeaderHeight: Float,
  val reservedFooterHeight: Float,
)

internal object LoofitWidgetLayoutContract {
  const val version = ${value.version}
  const val fingerprint = ${kotlinString(fingerprint)}
  const val calendarColumns = ${value.heatmap.weekdayLabels.length}
  const val contentPadding = ${kotlinNumber(value.designSystem.contentPadding)}f
  const val containerRadius = ${kotlinNumber(value.designSystem.radius.container)}f

  object SurfaceKinds {
    const val CONTROL = ${kotlinString(surfaceKinds.control)}
    const val HEATMAP_WEEK = ${kotlinString(surfaceKinds.heatmapWeek)}
    const val HEATMAP_MONTH = ${kotlinString(surfaceKinds.heatmapMonth)}
    const val HEATMAP_SIX_MONTHS = ${kotlinString(surfaceKinds.heatmapSixMonths)}
    const val CURRENT_MONTH = ${kotlinString(surfaceKinds.currentMonth)}
    const val FOUR_WEEK_EXPANDED = ${kotlinString(surfaceKinds.fourWeekExpanded)}
    const val ROUTINE_PROGRESS = ${kotlinString(surfaceKinds.routineProgress)}
    const val BODY_PART_DURATION = ${kotlinString(surfaceKinds.bodyPartDuration)}
    const val LOCK_WORKOUT = ${kotlinString(surfaceKinds.lockWorkout)}
    const val LOCK_THREE_WEEK = ${kotlinString(surfaceKinds.lockThreeWeek)}
    const val LOCK_NEXT_THREE_WEEK = ${kotlinString(surfaceKinds.lockNextThreeWeek)}
    const val LOCK_ROUTINE_PROGRESS = ${kotlinString(surfaceKinds.lockRoutineProgress)}
    val all = listOf(
      CONTROL,
      HEATMAP_WEEK,
      HEATMAP_MONTH,
      HEATMAP_SIX_MONTHS,
      CURRENT_MONTH,
      FOUR_WEEK_EXPANDED,
      ROUTINE_PROGRESS,
      BODY_PART_DURATION,
      LOCK_WORKOUT,
      LOCK_THREE_WEEK,
      LOCK_NEXT_THREE_WEEK,
      LOCK_ROUTINE_PROGRESS,
    )
  }

  object ContentMargins {
    const val homeReferenceShortestEdge = ${kotlinNumber(value.contentMargins.home.referenceShortestEdge)}f
  }

  object PreviewViewports {
    val homeSmall = LoofitWidgetViewportSpec(
      width = ${kotlinNumber(value.previewViewports.homeSmall.width)}f,
      height = ${kotlinNumber(value.previewViewports.homeSmall.height)}f,
    )
    val homeMedium = LoofitWidgetViewportSpec(
      width = ${kotlinNumber(value.previewViewports.homeMedium.width)}f,
      height = ${kotlinNumber(value.previewViewports.homeMedium.height)}f,
    )
    val accessoryRectangular = LoofitWidgetViewportSpec(
      width = ${kotlinNumber(value.previewViewports.accessoryRectangular.width)}f,
      height = ${kotlinNumber(value.previewViewports.accessoryRectangular.height)}f,
    )
  }

  object AndroidPlatform {
    const val renderer = ${kotlinString(androidPolicy.renderer)}
    const val sizing = ${kotlinString(androidPolicy.sizing)}

    object PreviewViewports {
      val homeSmall = LoofitWidgetViewportSpec(
        width = ${kotlinNumber(androidPreviewViewports.homeSmall.width)}f,
        height = ${kotlinNumber(androidPreviewViewports.homeSmall.height)}f,
      )
      val homeMedium = LoofitWidgetViewportSpec(
        width = ${kotlinNumber(androidPreviewViewports.homeMedium.width)}f,
        height = ${kotlinNumber(androidPreviewViewports.homeMedium.height)}f,
      )
      val accessoryRectangular = LoofitWidgetViewportSpec(
        width = ${kotlinNumber(androidPreviewViewports.accessoryRectangular.width)}f,
        height = ${kotlinNumber(androidPreviewViewports.accessoryRectangular.height)}f,
      )
    }

    object ProviderSizing {
      val homeSmall = LoofitWidgetProviderSizeSpec(
        minWidth = ${androidProviderSizing.homeSmall.minWidth},
        minHeight = ${androidProviderSizing.homeSmall.minHeight},
        targetCellWidth = ${androidProviderSizing.homeSmall.targetCellWidth},
        targetCellHeight = ${androidProviderSizing.homeSmall.targetCellHeight},
      )
      val homeMedium = LoofitWidgetProviderSizeSpec(
        minWidth = ${androidProviderSizing.homeMedium.minWidth},
        minHeight = ${androidProviderSizing.homeMedium.minHeight},
        targetCellWidth = ${androidProviderSizing.homeMedium.targetCellWidth},
        targetCellHeight = ${androidProviderSizing.homeMedium.targetCellHeight},
      )
      val accessoryRectangular = LoofitWidgetProviderSizeSpec(
        minWidth = ${androidProviderSizing.accessoryRectangular.minWidth},
        minHeight = ${androidProviderSizing.accessoryRectangular.minHeight},
        targetCellWidth = ${androidProviderSizing.accessoryRectangular.targetCellWidth},
        targetCellHeight = ${androidProviderSizing.accessoryRectangular.targetCellHeight},
      )
    }
  }

  object Spacing {
    const val xs = ${kotlinNumber(value.designSystem.spacing.xs)}f
    const val sm = ${kotlinNumber(value.designSystem.spacing.sm)}f
    const val md = ${kotlinNumber(value.designSystem.spacing.md)}f
    const val lg = ${kotlinNumber(value.designSystem.spacing.lg)}f
  }

  object Radius {
    const val cell = ${kotlinNumber(value.designSystem.radius.cell)}f
    const val control = ${kotlinNumber(value.designSystem.radius.control)}f
    const val container = ${kotlinNumber(value.designSystem.radius.container)}f
  }

  object Typography {
    object Sm {
      const val size = ${kotlinNumber(value.designSystem.typography.sm.size)}f
      const val lineHeight = ${kotlinNumber(value.designSystem.typography.sm.lineHeight)}f
    }
    object Md {
      const val size = ${kotlinNumber(value.designSystem.typography.md.size)}f
      const val lineHeight = ${kotlinNumber(value.designSystem.typography.md.lineHeight)}f
    }
    object Lg {
      const val size = ${kotlinNumber(value.designSystem.typography.lg.size)}f
      const val lineHeight = ${kotlinNumber(value.designSystem.typography.lg.lineHeight)}f
    }
    object Xl {
      const val size = ${kotlinNumber(value.designSystem.typography.xl.size)}f
      const val lineHeight = ${kotlinNumber(value.designSystem.typography.xl.lineHeight)}f
    }
  }

  object FontWeight {
    const val bold = ${Number(value.designSystem.fontWeight.bold)}
    const val medium = ${Number(value.designSystem.fontWeight.medium)}
    const val light = ${Number(value.designSystem.fontWeight.light)}
  }

  object Opacity {
    const val defaultValue = ${kotlinNumber(value.designSystem.opacity.default)}f
    const val muted = ${kotlinNumber(value.designSystem.opacity.muted)}f
  }

  object MinimumScale {
    const val compact = ${kotlinNumber(value.designSystem.minimumScale.compact)}f
    const val calendar = ${kotlinNumber(value.designSystem.minimumScale.calendar)}f
    const val display = ${kotlinNumber(value.designSystem.minimumScale.display)}f
    const val dense = ${kotlinNumber(value.designSystem.minimumScale.dense)}f
    const val timer = ${kotlinNumber(value.designSystem.minimumScale.timer)}f
    const val defaultValue = ${kotlinNumber(value.designSystem.minimumScale.default)}f
  }

  object Text {
    object Label {
      const val size = ${kotlinNumber(value.text.label.size)}f
      const val lineHeight = ${kotlinNumber(value.text.label.lineHeight)}f
      const val weight = ${Number(value.text.label.weight)}
    }
    object Brand {
      const val size = ${kotlinNumber(value.text.brand.size)}f
      const val lineHeight = ${kotlinNumber(value.text.brand.lineHeight)}f
      const val weight = ${Number(value.text.brand.weight)}
    }
    object Calendar {
      const val weekdaySize = ${kotlinNumber(value.text.calendar.weekdaySize)}f
      const val weekdayLineHeight = ${kotlinNumber(value.text.calendar.weekdayLineHeight)}f
      const val weekdayWeight = ${Number(value.text.calendar.weekdayWeight)}
      const val monthSize = ${kotlinNumber(value.text.calendar.monthSize)}f
      const val monthLineHeight = ${kotlinNumber(value.text.calendar.monthLineHeight)}f
    }
  }

  object Control {
    const val cardSize = ${kotlinNumber(value.control.cardSize)}f
    const val bodyGap = ${kotlinNumber(value.control.bodyGap)}f
    const val activeDotSize = ${kotlinNumber(value.control.activeDotSize)}f
    const val activeDotGap = ${kotlinNumber(value.control.activeDotGap)}f
    const val buttonHeight = ${kotlinNumber(value.control.buttonHeight)}f
    const val buttonRadius = ${kotlinNumber(value.control.buttonRadius)}f
    const val footerGap = ${kotlinNumber(value.control.footerGap)}f
    const val timerMaxHours = ${value.control.timerMaxHours}
    const val titleSize = ${kotlinNumber(value.control.text.title.size)}f
    const val titleLineHeight = ${kotlinNumber(value.control.text.title.lineHeight)}f
    const val titleWeight = ${Number(value.control.text.title.weight)}
    const val titleMinimumScaleFactor = ${kotlinNumber(value.control.text.title.minimumScaleFactor)}f
    const val timerSize = ${kotlinNumber(value.control.text.timer.size)}f
    const val timerLineHeight = ${kotlinNumber(value.control.text.timer.lineHeight)}f
    const val timerWeight = ${Number(value.control.text.timer.weight)}
    const val timerMinimumScaleFactor = ${kotlinNumber(value.control.text.timer.minimumScaleFactor)}f
    const val detailSize = ${kotlinNumber(value.control.text.detail.size)}f
    const val detailLineHeight = ${kotlinNumber(value.control.text.detail.lineHeight)}f
    const val detailWeight = ${Number(value.control.text.detail.weight)}
    const val buttonTextSize = ${kotlinNumber(value.control.text.button.size)}f
    const val buttonTextWeight = ${Number(value.control.text.button.weight)}
    const val durationSize = ${kotlinNumber(value.control.text.duration.size)}f
    const val durationLineHeight = ${kotlinNumber(value.control.text.duration.lineHeight)}f
    const val durationWeight = ${Number(value.control.text.duration.weight)}
    const val rangeSize = ${kotlinNumber(value.control.text.range.size)}f
    const val rangeLineHeight = ${kotlinNumber(value.control.text.range.lineHeight)}f
    const val rangeWeight = ${Number(value.control.text.range.weight)}

    object Copy {
      const val idle = ${kotlinString(value.control.copy.idle)}
      const val active = ${kotlinString(value.control.copy.active)}
      const val completed = ${kotlinString(value.control.copy.completed)}
      const val start = ${kotlinString(value.control.copy.start)}
      const val end = ${kotlinString(value.control.copy.end)}
      const val routineRequired = ${kotlinString(value.control.copy.routineRequired)}
    }
  }

  object Heatmap {
    val weekdayLabels = listOf(${value.heatmap.weekdayLabels.map(kotlinString).join(", ")})
    val weekendWeekdayLabels = listOf(${value.heatmap.weekdayLabelColorPolicy.weekendLabels.map(kotlinString).join(", ")})
    val bucketThresholdSeconds = intArrayOf(${value.heatmap.bucketThresholdSeconds.join(", ")})
    val bucketAccentWeights = floatArrayOf(${value.heatmap.bucketAccentWeights.map((weight) => `${kotlinNumber(weight)}f`).join(", ")})
    const val weekdayLabelHeightInCells = ${kotlinNumber(value.heatmap.weekdayLabelHeightInCells)}f
    const val strongCellLabelMinimumBucket = ${value.heatmap.cellLabelColorPolicy.strongMinimumBucket}
    const val strongCellLabelMinimumDurationSeconds = ${value.heatmap.cellLabelColorPolicy.strongMinimumDurationSeconds}
    const val weekRangeDays = ${variants.week.rangeDays}
    const val monthRangeWeeks = ${variants.month.rangeWeeks}
    const val sixMonthRangeMonths = ${variants.year.rangeMonths}
    const val monthBoundaryGapSlots = ${variants.year.monthBoundaryGapSlots}
    const val currentMonthMaxRows = ${currentMonth.maxRows}
    const val fourWeekExpandedRangeWeeks = ${fourWeekExpanded.rangeWeeks}
    val week = ${heatmapVariant(variants.week)}
    val month = ${heatmapVariant(variants.month)}
    val year = ${heatmapVariant(variants.year)}

    object SixMonth {
      const val monthLabelSize = ${kotlinNumber(value.heatmap.sixMonth.monthLabelSize)}f
      const val monthLabelHeight = ${kotlinNumber(value.heatmap.sixMonth.monthLabelHeight)}f
      const val monthHeaderBottomGap = ${kotlinNumber(value.heatmap.sixMonth.monthHeaderBottomGap)}f
    }

    object WeekFooter {
      val statOrder = listOf(${value.heatmap.weekFooter.statOrder.map((stat) => `LoofitHeatmapStat.${kotlinEnumCase(stat)}`).join(", ")})
      val statLabels = listOf(${value.heatmap.weekFooter.statLabels.map(kotlinString).join(", ")})
      const val recentLabel = ${kotlinString(value.heatmap.weekFooter.recentLabel)}
      const val emptyRecentLabel = ${kotlinString(value.heatmap.weekFooter.emptyRecentLabel)}
      const val alwaysShowRecent = ${value.heatmap.weekFooter.alwaysShowRecent}
      const val recentLimit = ${value.heatmap.weekFooter.recentLimit}
      const val topRowGap = ${kotlinNumber(value.heatmap.weekFooter.topRowGap)}f
      const val statGap = ${kotlinNumber(value.heatmap.weekFooter.statGap)}f
      const val recentRowGap = ${kotlinNumber(value.heatmap.weekFooter.recentRowGap)}f
      const val statLabelSize = ${kotlinNumber(value.heatmap.weekFooter.statLabelSize)}f
      const val statValueSize = ${kotlinNumber(value.heatmap.weekFooter.statValueSize)}f
      const val statValueMinimumScale = ${kotlinNumber(value.heatmap.weekFooter.statValueMinimumScale)}f
      const val recentLabelSize = ${kotlinNumber(value.heatmap.weekFooter.recentLabelSize)}f
      const val recentValueSize = ${kotlinNumber(value.heatmap.weekFooter.recentValueSize)}f
      const val recentMetaSize = ${kotlinNumber(value.heatmap.weekFooter.recentMetaSize)}f
    }

    object MonthFooter {
      val statOrder = listOf(${value.heatmap.monthFooter.statOrder.map((stat) => `LoofitHeatmapStat.${kotlinEnumCase(stat)}`).join(", ")})
      const val separator = ${kotlinString(value.heatmap.monthFooter.separator)}
      const val totalDurationPrefix = ${kotlinString(value.heatmap.monthFooter.totalDurationPrefix)}
    }
  }

  object CurrentMonth {
    const val contentPadding = ${kotlinNumber(currentMonth.contentPadding)}f
    const val cellGap = ${kotlinNumber(currentMonth.cellGap)}f
    const val cellRadius = ${kotlinNumber(currentMonth.cellRadius)}f
    const val cellLabelSize = ${kotlinNumber(currentMonth.cellLabelSize)}f
    const val cellLabelMinimumScaleFactor = ${kotlinNumber(currentMonth.cellLabelMinimumScaleFactor)}f
    const val headerGap = ${kotlinNumber(currentMonth.headerGap)}f
    const val headerFontSize = ${kotlinNumber(currentMonth.headerFontSize)}f
    const val headerLineHeight = ${kotlinNumber(currentMonth.headerLineHeight)}f
    const val headerMinimumScaleFactor = ${kotlinNumber(currentMonth.headerMinimumScaleFactor)}f
    const val outsideMonthDateLabelOnly = ${currentMonth.outsideMonthCells === "dateLabelOnly"}
    const val todayIndicatorWidth = ${kotlinNumber(currentMonth.todayIndicator.width)}f
  }

  object FourWeekExpanded {
    const val rangeWeeks = ${fourWeekExpanded.rangeWeeks}
    const val columns = ${fourWeekExpanded.columns}
    const val contentPadding = ${kotlinNumber(fourWeekExpanded.contentPadding)}f
    const val cellGap = ${kotlinNumber(fourWeekExpanded.cellGap)}f
    const val cellRadius = ${kotlinNumber(fourWeekExpanded.cellRadius)}f
    const val cellLabelSize = ${kotlinNumber(fourWeekExpanded.cellLabelSize)}f
    const val cellLabelMinimumScaleFactor = ${kotlinNumber(fourWeekExpanded.cellLabelMinimumScaleFactor)}f
    const val cellLabelLineHeight = ${kotlinNumber(fourWeekExpanded.cellLabelLineHeight)}f
    const val bodyPartLabelSize = ${kotlinNumber(fourWeekExpanded.bodyPartLabelSize)}f
    const val bodyPartLabelLineHeight = ${kotlinNumber(fourWeekExpanded.bodyPartLabelLineHeight)}f
    const val bodyPartLabelOpacity = ${kotlinNumber(fourWeekExpanded.bodyPartLabelOpacity)}f
    const val cellContentGap = ${kotlinNumber(fourWeekExpanded.cellContentGap)}f
    const val weekdayHeaderHeight = ${kotlinNumber(fourWeekExpanded.weekdayHeaderHeight)}f
    const val headerGap = ${kotlinNumber(fourWeekExpanded.headerGap)}f
    const val bodyPartSeparator = ${kotlinString(fourWeekExpanded.bodyPartSeparator)}
  }

  object RoutineProgress {
    const val visibleItemLimit = ${routineProgress.visibleItemLimit}
    const val contentPadding = ${kotlinNumber(routineProgress.contentPadding)}f
    const val metadataSeparator = ${kotlinString(routineProgress.metadataSeparator)}
    const val emptyRelativeDay = ${kotlinString(routineProgress.emptyRelativeDay)}
    const val splitSize = ${kotlinNumber(routineProgress.text.split.size)}f
    const val splitLineHeight = ${kotlinNumber(routineProgress.text.split.lineHeight)}f
    const val splitWeight = ${Number(routineProgress.text.split.weight)}
    const val metadataSize = ${kotlinNumber(routineProgress.text.metadata.size)}f
    const val metadataLineHeight = ${kotlinNumber(routineProgress.text.metadata.lineHeight)}f
    const val metadataWeight = ${Number(routineProgress.text.metadata.weight)}

    object LockScreen {
      const val visibleItemLimit = ${routineProgressLock.visibleItemLimit}
      const val contentPadding = ${kotlinNumber(routineProgressLock.contentPadding)}f
      const val columnGap = ${kotlinNumber(routineProgressLock.columnGap)}f
      const val itemGap = ${kotlinNumber(routineProgressLock.itemGap)}f
      const val workoutSize = ${kotlinNumber(routineProgressLock.text.workout.size)}f
      const val workoutLineHeight = ${kotlinNumber(routineProgressLock.text.workout.lineHeight)}f
      const val workoutWeight = ${Number(routineProgressLock.text.workout.weight)}
      const val relativeDaySize = ${kotlinNumber(routineProgressLock.text.relativeDay.size)}f
      const val relativeDayLineHeight = ${kotlinNumber(routineProgressLock.text.relativeDay.lineHeight)}f
      const val relativeDayWeight = ${Number(routineProgressLock.text.relativeDay.weight)}
    }
  }

  object BodyPartDuration {
    const val rangeDays = ${bodyPartDuration.rangeDays}
    const val visibleItemLimit = ${bodyPartDuration.visibleItemLimit}
    const val title = ${kotlinString(bodyPartDuration.title)}
    const val contentPadding = ${kotlinNumber(bodyPartDuration.contentPadding)}f
    const val barHeight = ${kotlinNumber(bodyPartDuration.bar.height)}f
    const val barRadius = ${kotlinNumber(bodyPartDuration.bar.radius)}f
    const val titleSize = ${kotlinNumber(bodyPartDuration.text.title.size)}f
    const val titleLineHeight = ${kotlinNumber(bodyPartDuration.text.title.lineHeight)}f
    const val titleWeight = ${Number(bodyPartDuration.text.title.weight)}
    const val bodyPartSize = ${kotlinNumber(bodyPartDuration.text.bodyPart.size)}f
    const val bodyPartLineHeight = ${kotlinNumber(bodyPartDuration.text.bodyPart.lineHeight)}f
    const val bodyPartWeight = ${Number(bodyPartDuration.text.bodyPart.weight)}
    const val durationSize = ${kotlinNumber(bodyPartDuration.text.duration.size)}f
    const val durationLineHeight = ${kotlinNumber(bodyPartDuration.text.duration.lineHeight)}f
    const val durationWeight = ${Number(bodyPartDuration.text.duration.weight)}
  }

  object LockScreen {
    const val active = ${kotlinString(value.lockScreen.copy.active)}
    const val completedEyebrow = ${kotlinString(value.lockScreen.copy.completedEyebrow)}
    const val completedBadge = ${kotlinString(value.lockScreen.copy.completedBadge)}
    const val idle = ${kotlinString(value.lockScreen.copy.idle)}
    const val routineRequired = ${kotlinString(value.lockScreen.copy.routineRequired)}
    const val compactCharacterLimit = ${value.lockScreen.compactCharacterLimit}
    const val inlineMinimumScaleFactor = ${kotlinNumber(value.lockScreen.text.inline.minimumScaleFactor)}f
    const val circularMinimumScaleFactor = ${kotlinNumber(value.lockScreen.text.circular.minimumScaleFactor)}f
    const val circularHorizontalPadding = ${kotlinNumber(value.lockScreen.text.circular.horizontalPadding)}f
    const val rectangularTitleSize = ${kotlinNumber(value.lockScreen.text.rectangularTitle.size)}f
    const val rectangularTitleLineHeight = ${kotlinNumber(value.lockScreen.text.rectangularTitle.lineHeight)}f
    const val rectangularTitleWeight = ${Number(value.lockScreen.text.rectangularTitle.weight)}
    const val rectangularTitleMinimumScaleFactor = ${kotlinNumber(value.lockScreen.text.rectangularTitle.minimumScaleFactor)}f
    const val rectangularDetailSize = ${kotlinNumber(value.lockScreen.text.rectangularDetail.size)}f
    const val rectangularDetailLineHeight = ${kotlinNumber(value.lockScreen.text.rectangularDetail.lineHeight)}f
    const val rectangularDetailWeight = ${Number(value.lockScreen.text.rectangularDetail.weight)}
    const val rectangularDetailMinimumScaleFactor = ${kotlinNumber(value.lockScreen.text.rectangularDetail.minimumScaleFactor)}f
    const val threeWeekCalendarRangeWeeks = ${lockScreenCalendar.rangeWeeks}
    const val nextThreeWeekCalendarRangeWeeks = ${nextLockScreenCalendar.rangeWeeks}

    object ThreeWeekCalendar {
      const val rangeWeeks = ${lockScreenCalendar.rangeWeeks}
      const val columns = ${lockScreenCalendar.columns}
      const val contentPadding = ${kotlinNumber(lockScreenCalendar.contentPadding)}f
      const val cellGap = ${kotlinNumber(lockScreenCalendar.cellGap)}f
      const val cellRadius = ${kotlinNumber(lockScreenCalendar.cellRadius)}f
      const val cellLabelSize = ${kotlinNumber(lockScreenCalendar.cellLabelSize)}f
      const val cellLabelMinimumScaleFactor = ${kotlinNumber(lockScreenCalendar.cellLabelMinimumScaleFactor)}f
      const val weekdayLabelSize = ${kotlinNumber(lockScreenCalendar.weekdayLabelSize)}f
      const val weekdayLabelLineHeight = ${kotlinNumber(lockScreenCalendar.weekdayLabelLineHeight)}f
      val dimmedWeekdayLabels = listOf(${lockScreenCalendar.dimmedWeekdayLabels.map(kotlinString).join(", ")})
      const val dimmedWeekdayOpacity = ${kotlinNumber(lockScreenCalendar.dimmedWeekdayOpacity)}f
      val bucketOpacities = floatArrayOf(${lockScreenCalendar.bucketOpacities.map((opacity) => `${kotlinNumber(opacity)}f`).join(", ")})
      const val todayIndicatorColor = ${kotlinString(lockScreenCalendar.todayIndicator.color)}
      const val todayIndicatorWidth = ${kotlinNumber(lockScreenCalendar.todayIndicator.width)}f
    }
  }

  object OngoingNotification {
    const val contentPadding = ${kotlinNumber(value.liveActivity.banner.contentPadding)}f
    const val contentGap = ${kotlinNumber(value.liveActivity.banner.contentGap)}f
    const val rowGap = ${kotlinNumber(value.liveActivity.banner.rowGap)}f
    const val titleSize = ${kotlinNumber(value.liveActivity.banner.titleFontSize)}f
    const val titleMinimumScaleFactor = ${kotlinNumber(value.liveActivity.banner.titleMinimumScaleFactor)}f
    const val statusSize = ${kotlinNumber(value.liveActivity.banner.statusFontSize)}f
    const val timerSize = ${kotlinNumber(value.liveActivity.banner.timerFontSize)}f
    const val buttonHeight = ${kotlinNumber(value.liveActivity.banner.buttonHeight)}f
    const val buttonTextSize = ${kotlinNumber(value.liveActivity.banner.buttonFontSize)}f
  }
}
`;
}

function kotlinString(value) {
  return JSON.stringify(value);
}

function kotlinEnumCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toUpperCase();
}

function kotlinNumber(value) {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot render non-finite Kotlin number: ${value}`);
  }
  return `${value}`;
}

function swiftNumber(value) {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot render non-finite Swift number: ${value}`);
  }
  return Number.isInteger(value) ? `${value}` : `${value}`;
}

function swiftFontWeight(value) {
  const weights = {
    600: "semibold",
    700: "bold",
    800: "heavy",
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
  return `[${values.map(swiftString).join(", ")}]`;
}

function swiftNumberArray(values) {
  return `[${values.map(swiftNumber).join(", ")}]`;
}

function swiftCase(value) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) {
    throw new Error(`Cannot render invalid Swift enum case: ${value}`);
  }
  return value;
}

function swiftCaseArray(values) {
  return `[${values.map((value) => `.${swiftCase(value)}`).join(", ")}]`;
}
