import { HStack, RoundedRectangle, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundColor,
  frame,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

import type { HeatmapWidgetProps } from './types';

// Each view below is extracted into an isolated JS context by the 'widget'
// directive (no module scope) and must keep every container's children as ONE
// flat array — the native children parser drops nested arrays silently.

/** systemSmall — last 7 days as a single row. */
function HeatmapWeekWidgetView(props: HeatmapWidgetProps) {
  'widget';

  const BG = '#141418';
  const TX3 = '#8A8A90';
  const TX4 = '#6B6B70';
  const CELL = 14;

  const source =
    typeof props.colors === 'string' ? props.colors.split(',').filter(Boolean) : [];
  const cells = source.slice(-7);

  const header = (
    <HStack key="header" spacing={4}>
      {[
        <Text key="title" modifiers={[font({ size: 11, weight: 'heavy' }), foregroundColor(TX3)]}>
          최근 7일
        </Text>,
        <Spacer key="spacer" />,
        <Text key="brand" modifiers={[font({ size: 10, weight: 'bold' }), foregroundColor(TX4)]}>
          LOOFIT
        </Text>,
      ]}
    </HStack>
  );

  const row = (
    <HStack key="row" spacing={3}>
      {cells.map((color, index) => (
        <RoundedRectangle
          key={index}
          cornerRadius={3}
          modifiers={[frame({ width: CELL, height: CELL }), foregroundColor(color)]}
        />
      ))}
    </HStack>
  );

  return (
    <VStack alignment="leading" spacing={8} modifiers={[containerBackground(BG, 'widget')]}>
      {[header, row]}
    </VStack>
  );
}

/** systemSmall — weekday-aligned 30-day grid. */
function HeatmapMonthWidgetView(props: HeatmapWidgetProps) {
  'widget';

  const BG = '#141418';
  const TX3 = '#8A8A90';
  const TX4 = '#6B6B70';
  const CELL = 12;

  const cells =
    typeof props.colors === 'string' ? props.colors.split(',').filter(Boolean) : [];

  const rows: string[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    rows.push(cells.slice(index, index + 7));
  }

  const header = (
    <HStack key="header" spacing={4}>
      {[
        <Text key="title" modifiers={[font({ size: 11, weight: 'heavy' }), foregroundColor(TX3)]}>
          최근 30일
        </Text>,
        <Spacer key="spacer" />,
        <Text key="brand" modifiers={[font({ size: 10, weight: 'bold' }), foregroundColor(TX4)]}>
          LOOFIT
        </Text>,
      ]}
    </HStack>
  );

  const rowViews = rows.map((row, rowIndex) => (
    <HStack key={rowIndex} spacing={3}>
      {row.map((color, cellIndex) => (
        <RoundedRectangle
          key={cellIndex}
          cornerRadius={3}
          modifiers={[frame({ width: CELL, height: CELL }), foregroundColor(color)]}
        />
      ))}
    </HStack>
  ));

  return (
    <VStack alignment="leading" spacing={4} modifiers={[containerBackground(BG, 'widget')]}>
      {[header, ...rowViews]}
    </VStack>
  );
}

/** systemMedium — GitHub-style year grid: weekday rows, weeks as columns. */
function HeatmapYearWidgetView(props: HeatmapWidgetProps) {
  'widget';

  const BG = '#141418';
  const TX3 = '#8A8A90';
  const TX4 = '#6B6B70';
  const CELL = 4;
  const GAP = 1.5;

  const cells =
    typeof props.colors === 'string' ? props.colors.split(',').filter(Boolean) : [];
  const weekCount = Math.ceil(cells.length / 7);

  const header = (
    <HStack key="header" spacing={4}>
      {[
        <Text key="title" modifiers={[font({ size: 11, weight: 'heavy' }), foregroundColor(TX3)]}>
          최근 1년
        </Text>,
        <Spacer key="spacer" />,
        <Text key="brand" modifiers={[font({ size: 10, weight: 'bold' }), foregroundColor(TX4)]}>
          LOOFIT
        </Text>,
      ]}
    </HStack>
  );

  // Row per weekday: cells[0] is always a Sunday, so week w / weekday d lives
  // at index w * 7 + d; indices past today render as blanks.
  const rowViews: React.JSX.Element[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const rowCells: React.JSX.Element[] = [];
    for (let week = 0; week < weekCount; week += 1) {
      const color = cells[week * 7 + weekday];
      rowCells.push(
        <RoundedRectangle
          key={week}
          cornerRadius={1}
          modifiers={[
            frame({ width: CELL, height: CELL }),
            foregroundColor(color ?? '#00000000'),
          ]}
        />
      );
    }
    rowViews.push(
      <HStack key={weekday} spacing={GAP}>
        {rowCells}
      </HStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={GAP + 4} modifiers={[containerBackground(BG, 'widget')]}>
      {[header, ...rowViews]}
    </VStack>
  );
}

export const HeatmapWeekWidget = createWidget<HeatmapWidgetProps>(
  'HeatmapWeekWidget',
  HeatmapWeekWidgetView
);

export const HeatmapMonthWidget = createWidget<HeatmapWidgetProps>(
  'HeatmapMonthWidget',
  HeatmapMonthWidgetView
);

export const HeatmapYearWidget = createWidget<HeatmapWidgetProps>(
  'HeatmapYearWidget',
  HeatmapYearWidgetView
);
