import { WIDGET_RENDERER_CONTRACT } from './generated/widget-renderer-contract.generated';

export { WIDGET_RENDERER_CONTRACT } from './generated/widget-renderer-contract.generated';

const { bodyPartDuration, card, control, heatmap, routineProgress, text } =
  WIDGET_RENDERER_CONTRACT;

/**
 * React Native preview projection of the canonical renderer contract.
 * The JSON contract is the editable source; both this shape and native Swift
 * constants are generated/derived from it.
 */
export const WIDGET_PREVIEW_SPEC = {
  screenBackground: card.screenBackground,
  card: {
    background: card.background,
    border: card.border,
    radius: card.radius,
    padding: card.contentPadding,
    gap: card.contentGap,
  },
  text,
  control,
  routineProgress,
  bodyPartDuration,
  heatmap: {
    week: previewHeatmapVariant(heatmap.variants.week),
    month: previewHeatmapVariant(heatmap.variants.month),
    year: {
      months: heatmap.variants.year.rangeMonths,
      contentPadding: heatmap.variants.year.contentPadding,
      cellGap: heatmap.variants.year.cellGap,
      cellRadius: heatmap.variants.year.cellRadius,
      headerGap: heatmap.variants.year.headerGap,
      headerVisible: heatmap.variants.year.headerVisible,
      headerLineHeight: heatmap.variants.year.headerLineHeight,
      headerMinimumScaleFactor: heatmap.variants.year.headerMinimumScaleFactor,
      cellLabelSize: heatmap.variants.year.cellLabelSize,
      cellLabelMinimumScaleFactor: heatmap.variants.year.cellLabelMinimumScaleFactor,
    },
  },
} as const;

export type WidgetPreviewPlatform = 'android' | 'ios';

export function widgetPreviewViewports(platform: WidgetPreviewPlatform) {
  return platform === 'android'
    ? WIDGET_RENDERER_CONTRACT.platformPolicy.android.previewViewports
    : WIDGET_RENDERER_CONTRACT.previewViewports;
}

export function widgetAccessoryPreviewBackdrop(platform: WidgetPreviewPlatform) {
  if (platform !== 'android') {
    return null;
  }
  const spec =
    WIDGET_RENDERER_CONTRACT.platformPolicy.android.accessoryPreviewBackdrop;
  return {
    backgroundColor:
      WIDGET_RENDERER_CONTRACT.previewPalette[spec.palette][spec.colorRole],
    borderRadius: spec.radius,
    mode: spec.mode,
  } as const;
}

function previewHeatmapVariant(
  variant: typeof heatmap.variants.week | typeof heatmap.variants.month
) {
  return {
    columns: variant.columns,
    contentPadding: variant.contentPadding,
    cellGap: variant.cellGap,
    cellRadius: variant.cellRadius,
    headerGap: variant.headerGap,
    headerVisible: variant.headerVisible,
    headerLineHeight: variant.headerLineHeight,
    headerMinimumScaleFactor: variant.headerMinimumScaleFactor,
    cellLabelSize: variant.cellLabelSize,
    cellLabelMinimumScaleFactor: variant.cellLabelMinimumScaleFactor,
  } as const;
}

export type HeatmapWidgetVariant = keyof typeof WIDGET_PREVIEW_SPEC.heatmap;

export function resolveHomeWidgetContentPadding(
  size: { height: number; width: number },
  basePadding: number = WIDGET_RENDERER_CONTRACT.card.contentPadding
) {
  const shortestEdge = Math.min(size.height, size.width);
  if (shortestEdge <= 0) {
    return basePadding;
  }

  return (
    basePadding *
    (shortestEdge /
      WIDGET_RENDERER_CONTRACT.contentMargins.home.referenceShortestEdge)
  );
}
