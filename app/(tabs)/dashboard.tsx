import { useState } from 'react';

import { Card } from '@/src/components/Card';
import { EmptyState } from '@/src/components/EmptyState';
import { HeatGrid, HeatLegend, HeatYearGrid } from '@/src/components/Heat';
import { DurationBars } from '@/src/components/PartBars';
import { Screen } from '@/src/components/Screen';
import { Segmented } from '@/src/components/Segmented';
import { StatTiles } from '@/src/components/StatTiles';
import { formatDuration } from '@/src/domain/date';
import { useAppStore } from '@/src/store/app-store';

type HeatRange = '7' | '30' | '365';

const RANGE_OPTIONS: Array<{ value: HeatRange; label: string }> = [
  { value: '7', label: '7일' },
  { value: '30', label: '30일' },
  { value: '365', label: '1년' },
];

export default function DashboardScreen() {
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
            cells={range === '7' ? overview.heatmap7 : overview.heatmap30}
            weekdayLabels
            alignToWeekdays={range === '30'}
          />
        )}
      </Card>

      <Card title="분할별 운동 시간">
        {stats.bySplit.length === 0 ? (
          <EmptyState compact title="아직 데이터가 없어요." />
        ) : (
          <DurationBars
            stats={stats.bySplit.slice(0, 6).map((split) => ({
              name: split.name,
              detail: `${split.workoutCount}회`,
              durationSeconds: split.durationSeconds,
            }))}
          />
        )}
      </Card>
    </Screen>
  );
}
