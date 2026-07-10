export const WIDGET_PREVIEW_SPEC = {
  screenBackground: '#0C0D10',
  card: {
    background: '#141418',
    border: 'rgba(255,255,255,0.08)',
    radius: 24,
    padding: 16,
    gap: 12,
  },
  text: {
    label: {
      size: 11,
      lineHeight: 14,
      weight: '800',
      color: '#8A8A90',
    },
    brand: {
      size: 10,
      lineHeight: 13,
      weight: '700',
      color: '#6B6B70',
    },
  },
  heatmap: {
    week: {
      columns: 7,
      cellGap: 4,
      cellRadius: 4,
      headerGap: 12,
    },
    month: {
      columns: 7,
      cellGap: 3,
      cellRadius: 3,
      headerGap: 12,
    },
    year: {
      cellGap: 1.5,
      cellRadius: 1,
      headerGap: 8,
    },
  },
} as const;

export type HeatmapWidgetVariant = keyof typeof WIDGET_PREVIEW_SPEC.heatmap;

