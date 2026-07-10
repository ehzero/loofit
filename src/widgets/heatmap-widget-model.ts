import { heatColor, type ThemeColors } from '@/src/theme/tokens';
import type { HeatmapDay } from '@/src/types';

import type { HeatmapWidgetProps } from './types';
import { WIDGET_PREVIEW_SPEC, type HeatmapWidgetVariant } from './widget-spec';

type HeatmapCellInput = Pick<HeatmapDay, 'bucket'> & {
  inRange?: boolean;
};

const TRANSPARENT_CELL = '#00000000';

export function buildHeatmapWidgetProps({
  variant,
  cells,
  colors,
}: {
  variant: HeatmapWidgetVariant;
  cells: HeatmapCellInput[];
  colors: ThemeColors;
}): HeatmapWidgetProps {
  const spec = WIDGET_PREVIEW_SPEC.heatmap[variant];

  return {
    // Widget previews intentionally show calendar placeholders as ordinary
    // empty cells, not transparent holes, so the grid keeps a stable rectangular
    // silhouette that matches the app preview design.
    colors: cells.map((cell) => heatColor(colors, cell.bucket, true)).join(','),
    background: WIDGET_PREVIEW_SPEC.card.background,
    titleColor: WIDGET_PREVIEW_SPEC.text.label.color,
    brandColor: WIDGET_PREVIEW_SPEC.text.brand.color,
    titleSize: WIDGET_PREVIEW_SPEC.text.label.size,
    brandSize: WIDGET_PREVIEW_SPEC.text.brand.size,
    contentPadding: WIDGET_PREVIEW_SPEC.card.padding,
    cellGap: spec.cellGap,
    cellRadius: spec.cellRadius,
    headerGap: spec.headerGap,
    columns: 'columns' in spec ? spec.columns : 0,
  };
}

export function buildHeatmapWidgetRows(
  props: HeatmapWidgetProps,
  variant: HeatmapWidgetVariant
): string[][] {
  const cells = parseHeatmapWidgetColors(props.colors);
  const columns =
    props.columns > 0
      ? props.columns
      : variant === 'week' || variant === 'month'
        ? WIDGET_PREVIEW_SPEC.heatmap[variant].columns
        : 7;

  if (variant === 'year') {
    const weekCount = Math.ceil(cells.length / 7);
    return Array.from({ length: 7 }, (_, weekday) =>
      Array.from({ length: weekCount }, (_, week) => cells[week * 7 + weekday] ?? TRANSPARENT_CELL)
    );
  }

  const rows: string[][] = [];
  for (let index = 0; index < cells.length; index += columns) {
    const row = cells.slice(index, index + columns);
    while (row.length < columns) {
      row.push(TRANSPARENT_CELL);
    }
    rows.push(row);
  }
  return rows;
}

export function parseHeatmapWidgetColors(colors: string): string[] {
  return typeof colors === 'string' ? colors.split(',').filter(Boolean) : [];
}
