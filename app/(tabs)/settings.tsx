import { StyleSheet, Text } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { Panel } from '@/src/components/Panel';
import { Screen } from '@/src/components/Screen';
import { useAppStore } from '@/src/store/app-store';
import { theme } from '@/src/styles/theme';

export default function SettingsScreen() {
  const resetDevData = useAppStore((state) => state.resetDevData);

  return (
    <Screen title="설정" subtitle="MVP는 로컬 퍼스트, iOS 우선으로 동작합니다.">
      <Panel title="출시 범위">
        <Text style={styles.text}>초기 MVP는 iOS 우선입니다.</Text>
        <Text style={styles.muted}>Android 위젯과 고정 알림은 iOS 반응 확인 후 확장합니다.</Text>
      </Panel>

      <Panel title="개발용 데이터">
        <Text style={styles.muted}>로컬 SQLite 데이터를 초기화하고 기본 운동 부위를 다시 생성합니다.</Text>
        <AppButton variant="danger" onPress={resetDevData}>
          로컬 데이터 초기화
        </AppButton>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  muted: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
});
