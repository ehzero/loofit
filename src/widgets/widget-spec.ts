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
    calendar: {
      weekdaySize: 8,
      weekdayLineHeight: 10,
      weekdayWeight: '800',
      monthSize: 9,
      monthLineHeight: 11,
      color: '#6B6B70',
      dayColor: '#9A9AA0',
    },
  },
  control: {
    cardSize: 158,
    headerHeight: 14,
    bodyHeight: 54,
    bodyGap: 4,
    activeDotSize: 7,
    activeDotGap: 6,
    buttonHeight: 28,
    buttonRadius: 12,
    buttonDarkBackground: '#26262B',
    footerWithRangeHeight: 41,
    footerGap: 1,
    timerMaxHours: 8,
    text: {
      title: {
        size: 19,
        lineHeight: 24,
        weight: '800',
        color: '#F4F4F2',
      },
      timer: {
        size: 26,
        lineHeight: 30,
        weight: '800',
        color: '#F4F4F2',
      },
      detail: {
        size: 13,
        lineHeight: 18,
        weight: '600',
        color: '#8A8A90',
      },
      button: {
        size: 13,
        lineHeight: 18,
        weight: '800',
      },
      duration: {
        size: 22,
        lineHeight: 26,
        weight: '800',
      },
      range: {
        size: 11,
        lineHeight: 14,
        weight: '600',
        color: '#8A8A90',
      },
    },
  },
  heatmap: {
    week: {
      columns: 7,
      cellGap: 4,
      cellRadius: 4,
      headerGap: 8,
      cellLabelSize: 8,
    },
    month: {
      columns: 7,
      cellGap: 3,
      cellRadius: 3,
      headerGap: 8,
      cellLabelSize: 7,
    },
    year: {
      months: 6,
      cellGap: 2,
      cellRadius: 2,
      headerGap: 8,
      monthGapColumns: 0,
      cellLabelSize: 0,
    },
  },
} as const;

export type HeatmapWidgetVariant = keyof typeof WIDGET_PREVIEW_SPEC.heatmap;
