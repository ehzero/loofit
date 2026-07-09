import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/AppText';
import { Card } from '@/src/components/Card';
import { ConfirmDialog, type ConfirmConfig } from '@/src/components/ConfirmDialog';
import { Icon } from '@/src/components/Icon';
import { ListRow } from '@/src/components/ListRow';
import { Screen } from '@/src/components/Screen';
import { Segmented } from '@/src/components/Segmented';
import { useAppStore } from '@/src/store/app-store';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/theme/ToastProvider';
import {
  ACCENT_OPTIONS,
  accentTextFor,
  radius,
  spacing,
  type ThemeMode,
} from '@/src/theme/tokens';

const MODE_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];

// TODO: placeholder — 실제 호스팅 URL로 교체 예정
const TERMS_URL = 'https://loofit.app/terms';
const PRIVACY_URL = 'https://loofit.app/privacy';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, mode, setMode, accent, setAccent } = useTheme();
  const { showToast } = useToast();
  const resetDevData = useAppStore((state) => state.resetDevData);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  return (
    <>
      <Screen title="설정">
        <Card padding={0} gap={0} style={styles.group}>
          <ListRow title="루틴 설정" chevron divider onPress={() => router.push('/routine')} />
          <ListRow title="위젯 미리보기" chevron onPress={() => router.push('/widgets')} />
        </Card>

        <Card padding={spacing.md} gap={spacing.md}>
          <View style={styles.subBlock}>
            <AppText variant="footnote" weight="700" tone="tertiary">
              테마
            </AppText>
            <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
          </View>
          <View style={styles.subBlock}>
            <AppText variant="footnote" weight="700" tone="tertiary">
              액센트 컬러
            </AppText>
            <View style={styles.swatches}>
              {ACCENT_OPTIONS.map((option) => {
                const selected = option === accent;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setAccent(option)}
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: option,
                        borderColor: selected ? colors.tx : 'transparent',
                      },
                    ]}>
                    {selected ? (
                      <Icon name="check" size={16} color={accentTextFor(option)} weight="bold" />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Card>

        <Card padding={0} gap={0} style={styles.group}>
          <ListRow
            title="앱 정보"
            divider
            right={
              <AppText variant="body" tone="muted">
                루핏 v0.1
              </AppText>
            }
          />
          <Pressable
            onPress={() =>
              setConfirm({
                title: '로컬 데이터를 초기화할까요?',
                description: '모든 운동 기록과 루틴이 삭제되고 첫 사용 화면으로 돌아가요.',
                confirmLabel: '초기화',
                danger: true,
                onConfirm: () => resetDevData().then(() => showToast('데이터를 초기화했어요')),
              })
            }
            style={styles.resetRow}>
            <AppText variant="item" tone="danger">
              로컬 데이터 초기화
            </AppText>
            <Icon name="trash" size={18} color={colors.danger} />
          </Pressable>
        </Card>

        <Card padding={0} gap={0} style={styles.group}>
          <ListRow
            title="이용약관"
            chevron
            divider
            onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}
          />
          <ListRow
            title="개인정보 처리방침"
            chevron
            onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}
          />
        </Card>

        <View style={styles.footer}>
          <AppText variant="label" weight="500" tone="hint">
            내 루틴대로, 운동을 가볍게 기록하세요.
          </AppText>
          <AppText variant="caption" weight="500" tone="hint">
            © {new Date().getFullYear()} Loofit. All rights reserved.
          </AppText>
        </View>
      </Screen>

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  group: {
    overflow: 'hidden',
  },
  subBlock: {
    gap: spacing.xs,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  footer: {
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.sm,
  },
});
