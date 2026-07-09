import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/src/components/Card';
import { ConfirmDialog, type ConfirmConfig } from '@/src/components/ConfirmDialog';
import { Icon } from '@/src/components/Icon';
import { Screen } from '@/src/components/Screen';
import { Segmented } from '@/src/components/Segmented';
import { useAppStore } from '@/src/store/app-store';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/theme/ToastProvider';
import { ACCENT_OPTIONS, accentTextFor, isLightHex, type ThemeMode } from '@/src/theme/tokens';

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
        <Card padding={0} gap={0} style={styles.navGroup}>
          <NavRow label="루틴 설정" onPress={() => router.push('/routine')} divider />
          <NavRow label="위젯 미리보기" onPress={() => router.push('/widgets')} />
        </Card>

        <Card padding={18} gap={18}>
          <View style={styles.subBlock}>
            <Text style={[styles.subLabel, { color: colors.tx3 }]}>테마</Text>
            <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} />
          </View>
          <View style={styles.subBlock}>
            <Text style={[styles.subLabel, { color: colors.tx3 }]}>액센트 컬러</Text>
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
                      <Icon
                        name="check"
                        size={16}
                        color={isLightHex(option) ? '#0B0B0B' : '#FFFFFF'}
                        weight="bold"
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Card>

        <Card padding={0} gap={0} style={styles.navGroup}>
          <View style={[styles.infoRow, { borderBottomColor: colors.line }]}>
            <Text style={[styles.infoLabel, { color: colors.tx2 }]}>앱 정보</Text>
            <Text style={[styles.infoValue, { color: colors.tx4 }]}>루핏 v0.1</Text>
          </View>
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
            <Text style={[styles.resetLabel, { color: colors.danger }]}>로컬 데이터 초기화</Text>
            <Icon name="trash" size={18} color={colors.danger} />
          </Pressable>
        </Card>

        <Card padding={0} gap={0} style={styles.navGroup}>
          <NavRow
            label="이용약관"
            onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}
            divider
          />
          <NavRow
            label="개인정보 처리방침"
            onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}
          />
        </Card>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.tx6 }]}>
            내 루틴대로, 운동을 가볍게 기록하세요.
          </Text>
          <Text style={[styles.copyright, { color: colors.tx6 }]}>
            © {new Date().getFullYear()} Loofit. All rights reserved.
          </Text>
        </View>
      </Screen>

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

function NavRow({
  label,
  onPress,
  divider,
}: {
  label: string;
  onPress: () => void;
  divider?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.navRow,
        divider ? { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth } : null,
      ]}>
      <Text style={[styles.navLabel, { color: colors.tx }]}>{label}</Text>
      <Icon name="chevronRight" size={18} color={colors.tx5} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  navGroup: {
    overflow: 'hidden',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 17,
    paddingHorizontal: 16,
  },
  navLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  subBlock: {
    gap: 10,
  },
  subLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 17,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 17,
    paddingHorizontal: 16,
  },
  resetLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
  },
  copyright: {
    fontSize: 11,
    fontWeight: '500',
  },
});
