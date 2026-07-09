import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Card } from '@/src/components/Card';
import { HeatGrid, HeatLegend, HeatYearGrid } from '@/src/components/Heat';
import { PartBars } from '@/src/components/PartBars';
import { Screen } from '@/src/components/Screen';
import { Segmented } from '@/src/components/Segmented';
import { StatTiles } from '@/src/components/StatTiles';
import { formatDuration } from '@/src/domain/date';
import { useAppStore } from '@/src/store/app-store';
import { useTheme } from '@/src/theme/ThemeProvider';

type HeatRange = '7' | '30' | '365';

const RANGE_OPTIONS: Array<{ value: HeatRange; label: string }> = [
  { value: '7', label: '7일' },
  { value: '30', label: '30일' },
  { value: '365', label: '1년' },
];

export default function DashboardScreen() {
  const { colors } = useTheme();
  const overview = useAppStore((state) => state.overview);
  const [range, setRange] = useState<HeatRange>('7');

  if (!overview) {
    return <Screen title="대시보드" isLoading />;
  }

  const stats =
    range === '7'
      ? overview.rangeStats.last7
      : range === '30'
        ? overview.rangeStats.last30
        : overview.rangeStats.last365;

  return (
    <Screen title="대시보드">
      <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />

      <StatTiles
        tiles={[
          { label: '운동 횟수', value: `${stats.workoutCount}회` },
          { label: '운동 시간', value: formatDuration(stats.durationSeconds) },
        ]}
      />

      <Card title="히트맵" action={<HeatLegend />}>
        {range === '365' ? (
          <HeatYearGrid cells={overview.heatmapYear} />
        ) : (
          <HeatGrid
            cells={range === '7' ? overview.heatmap7 : overview.heatmapGrid}
            weekdayLabels
          />
        )}
      </Card>

      <Card title="부위별 운동 시간">
        {overview.dashboard.byBodyPart.length === 0 ? (
          <Text style={[styles.empty, { color: colors.tx5 }]}>아직 데이터가 없어요.</Text>
        ) : (
          <PartBars
            stats={overview.dashboard.byBodyPart.slice(0, 6).map((part) => ({
              name: part.name,
              durationSeconds: part.durationSeconds,
            }))}
          />
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: 13,
  },
});
