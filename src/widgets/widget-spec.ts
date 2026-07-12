import { WIDGET_RENDERER_CONTRACT } from './generated/widget-renderer-contract.generated';

export { WIDGET_RENDERER_CONTRACT } from './generated/widget-renderer-contract.generated';

const { card, control, heatmap, text } = WIDGET_RENDERER_CONTRACT;

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
  heatmap: {
    week: previewHeatmapVariant(heatmap.variants.week),
    month: previewHeatmapVariant(heatmap.variants.month),
    year: {
      months: heatmap.variants.year.rangeMonths,
      cellGap: heatmap.variants.year.cellGap,
      cellRadius: heatmap.variants.year.cellRadius,
      headerGap: heatmap.variants.year.headerGap,
      cellLabelSize: heatmap.variants.year.cellLabelSize,
    },
  },
} as const;

function previewHeatmapVariant(
  variant: typeof heatmap.variants.week | typeof heatmap.variants.month
) {
  return {
    columns: variant.columns,
    cellGap: variant.cellGap,
    cellRadius: variant.cellRadius,
    headerGap: variant.headerGap,
    cellLabelSize: variant.cellLabelSize,
  } as const;
}

export type HeatmapWidgetVariant = keyof typeof WIDGET_PREVIEW_SPEC.heatmap;
