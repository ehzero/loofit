import { describe, expect, it } from 'vitest';

import { buildHeatmap } from './heatmap';
import { buildWeekdayAlignedRows } from './heatmap-layout';

describe('dashboard heatmap layout', () => {
  it('keeps exactly 30 dates and leaves earlier weekday columns empty', () => {
    const cells = buildHeatmap([], 30, new Date(2026, 6, 12, 10));
    const rows = buildWeekdayAlignedRows(cells);
    const renderedDates = rows.flat().filter((cell) => cell !== null);

    expect(cells).toHaveLength(30);
    expect(renderedDates).toHaveLength(30);
    expect(renderedDates[0]?.dateKey).toBe('2026-06-13');
    expect(rows[0].slice(0, 6)).toEqual(Array(6).fill(null));
    expect(rows[0][6]?.dateKey).toBe('2026-06-13');
    expect(renderedDates.at(-1)?.dateKey).toBe('2026-07-12');
  });
});
