import { describe, expect, it } from 'vitest';

import { makeColors } from '@/src/theme/tokens';
import type { HeatmapDay } from '@/src/types';

import { buildHeatmapWidgetProps, buildHeatmapWidgetRows } from './heatmap-widget-model';
import { buildCurrentMonthHeatmapModel } from './current-month-heatmap-model';

describe('buildCurrentMonthHeatmapModel', () => {
  it('keeps outside-month dates as label-only cells in a Sunday-first calendar grid', () => {
    const source = new Map<string, HeatmapDay>([
      ['2026-06-30', { dateKey: '2026-06-30', durationSeconds: 1_800, bucket: 2 }],
      ['2026-07-01', { dateKey: '2026-07-01', durationSeconds: 3_600, bucket: 3 }],
      ['2026-07-13', { dateKey: '2026-07-13', durationSeconds: 4_200, bucket: 4 }],
      ['2026-07-14', { dateKey: '2026-07-14', durationSeconds: 4_200, bucket: 4 }],
    ]);

    const model = buildCurrentMonthHeatmapModel(source, new Date(2026, 6, 13, 12));

    expect(model.title).toBe('7월');
    expect(model.cells).toHaveLength(35);
    expect(model.cells.slice(0, 3)).toEqual([
      { dateKey: '2026-06-28', durationSeconds: 0, bucket: 0, inRange: false, isGap: true },
      { dateKey: '2026-06-29', durationSeconds: 0, bucket: 0, inRange: false, isGap: true },
      { dateKey: '2026-06-30', durationSeconds: 0, bucket: 0, inRange: false, isGap: true },
    ]);
    expect(model.cells[3]).toMatchObject({
      dateKey: '2026-07-01',
      durationSeconds: 3_600,
      bucket: 3,
      inRange: true,
    });
    expect(model.cells.find((cell) => cell.dateKey === '2026-07-14')).toMatchObject({
      durationSeconds: 0,
      bucket: 0,
      inRange: true,
    });
    expect(model.cells.filter((cell) => cell.isToday)).toEqual([
      expect.objectContaining({ dateKey: '2026-07-13', isToday: true }),
    ]);
    expect(model.cells.at(-1)).toEqual({
      dateKey: '2026-08-01',
      durationSeconds: 0,
      bucket: 0,
      inRange: false,
      isGap: true,
    });
  });

  it('serializes outside-month cells with a date label and transparent background', () => {
    const colors = makeColors('dark', '#CFF56A');
    const model = buildCurrentMonthHeatmapModel(new Map(), new Date(2026, 6, 13, 12));
    const props = buildHeatmapWidgetProps({
      title: model.title,
      variant: 'month',
      cells: model.cells,
      colors,
    });

    expect(buildHeatmapWidgetRows(props, 'month').flat()[0]).toEqual({
      color: '#00000000',
      label: '28',
      labelColor: colors.tx4,
      isToday: false,
    });
  });

  it('expands to six calendar rows when the current month requires them', () => {
    const model = buildCurrentMonthHeatmapModel(new Map(), new Date(2026, 7, 15, 12));

    expect(model.cells).toHaveLength(42);
    expect(model.cells.filter((cell) => cell.inRange)).toHaveLength(31);
    expect(model.cells.filter((cell) => cell.isToday)).toEqual([
      expect.objectContaining({ dateKey: '2026-08-15', isToday: true }),
    ]);
  });

  it('preserves the current-day marker through preview serialization', () => {
    const colors = makeColors('dark', '#CFF56A');
    const model = buildCurrentMonthHeatmapModel(new Map(), new Date(2026, 6, 13, 12));
    const props = buildHeatmapWidgetProps({
      title: model.title,
      variant: 'month',
      cells: model.cells,
      colors,
    });

    const todayCells = buildHeatmapWidgetRows(props, 'month')
      .flat()
      .filter((cell) => cell.isToday);

    expect(todayCells).toEqual([expect.objectContaining({ label: '13', isToday: true })]);
    expect(props.todayIndicatorColor).toBe('#FFFFFF');
    expect(props.todayIndicatorWidth).toBe(1.5);
  });

  it('uses the red today variation for a white accent in dark mode', () => {
    const colors = makeColors('dark', '#FFFFFF');
    const source = new Map<string, HeatmapDay>([
      ['2026-07-13', { dateKey: '2026-07-13', durationSeconds: 5_400, bucket: 4 }],
    ]);
    const model = buildCurrentMonthHeatmapModel(source, new Date(2026, 6, 13, 12));
    const props = buildHeatmapWidgetProps({
      title: model.title,
      variant: 'month',
      cells: model.cells,
      colors,
    });
    expect(buildHeatmapWidgetRows(props, 'month').flat().find((cell) => cell.isToday)).toMatchObject({
      label: '13',
      isToday: true,
    });
    expect(props.todayIndicatorColor).toBe(colors.danger);
    expect(props.todayIndicatorColor).not.toBe(colors.tx);
  });
});
