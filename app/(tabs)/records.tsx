import { useRouter } from 'expo-router';
import { Text } from 'react-native';

import { Panel } from '@/src/components/Panel';
import { SessionRow } from '@/src/components/Rows';
import { Screen } from '@/src/components/Screen';
import { useAppStore } from '@/src/store/app-store';
import { theme } from '@/src/styles/theme';

export default function RecordsScreen() {
  const router = useRouter();
  const overview = useAppStore((state) => state.overview);

  if (!overview) {
    return <Screen title="기록" isLoading />;
  }

  return (
    <Screen title="기록" subtitle="완료, 취소, 진행 중 세션을 모두 확인합니다.">
      <Panel title="최근 운동 기록">
        {overview.recentSessions.length === 0 ? (
          <Text style={{ color: theme.colors.muted }}>아직 운동 기록이 없습니다.</Text>
        ) : (
          overview.recentSessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onPress={() => router.push(`/record/${session.id}`)}
            />
          ))
        )}
      </Panel>
    </Screen>
  );
}
