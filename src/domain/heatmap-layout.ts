const CALENDAR_COLUMNS = 7;

/**
 * Splits an exact date range into Sunday-first calendar rows without creating
 * date cells before the range starts. `null` values reserve only the weekday
 * columns needed to position the first real date.
 */
export function buildWeekdayAlignedRows<T extends { dateKey: string }>(
  cells: T[],
): Array<Array<T | null>> {
  if (cells.length === 0) {
    return [];
  }

  const alignedCells: Array<T | null> = [
    ...Array.from({ length: weekdayIndex(cells[0].dateKey) }, () => null),
    ...cells,
  ];
  const rows: Array<Array<T | null>> = [];

  for (let index = 0; index < alignedCells.length; index += CALENDAR_COLUMNS) {
    const row = alignedCells.slice(index, index + CALENDAR_COLUMNS);
    while (row.length < CALENDAR_COLUMNS) {
      row.push(null);
    }
    rows.push(row);
  }

  return rows;
}

function weekdayIndex(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}
