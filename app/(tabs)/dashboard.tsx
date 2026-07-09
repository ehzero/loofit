import { StyleSheet, Text, View } from 'react-native';

import { Heatmap } from '@/src/components/Heatmap';
import { Panel } from '@/src/components/Panel';
import { Screen } from '@/src/components/Screen';
import { formatDuration } from '@/src/domain/date';
import { useAppStore } from '@/src/store/app-store';
import { theme } from '@/src/styles/theme';

export default function DashboardScreen() {
  const overview = useAppStore((state) => state.overview);

  if (!overview) {
    return <Screen title="대시보드" isLoading />;
  }

  return (
    <Screen title="대시보드" subtitle="최근 운동 패턴을 빠르게 확인합니다.">
      <View style={styles.stats}>
        <Panel>
          <Text style={styles.metric}>{overview.dashboard.weekWorkoutCount}</Text>
          <Text style={styles.label}>이번 주 운동</Text>
        </Panel>
        <Panel>
          <Text style={styles.metric}>{formatDuration(overview.dashboard.totalDurationSeconds)}</Text>
          <Text style={styles.label}>총 운동 시간</Text>
        </Panel>
      </View>

      <Panel title="최근 7일">
        <Heatmap days={overview.heatmap7} />
      </Panel>

      <Panel title="최근 30일">
        <Heatmap days={overview.heatmap30} />
      </Panel>

      <Panel title="부위별 운동 시간">
        {overview.dashboard.byBodyPart.length === 0 ? (
          <Text style={styles.label}>완료된 운동 기록이 아직 없습니다.</Text>
        ) : (
          overview.dashboard.byBodyPart.map((part) => (
            <View key={part.name} style={styles.partRow}>
              <View style={[styles.partDot, { backgroundColor: part.color }]} />
              <Text style={styles.partName}>{part.name}</Text>
              <Text style={styles.partDuration}>{formatDuration(part.durationSeconds)}</Text>
            </View>
          ))
        )}
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  metric: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  label: {
    color: theme.colors.muted,
    fontSize: 14,
  },
  partRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  partDot: {
    borderRadius: 999,
    height: 12,
    width: 12,
  },
  partName: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  partDuration: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
});
