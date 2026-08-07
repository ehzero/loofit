import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/AppText';
import { Card } from '@/src/components/Card';
import { ConfirmDialog, type ConfirmConfig } from '@/src/components/ConfirmDialog';
import { Icon } from '@/src/components/Icon';
import { ListRow } from '@/src/components/ListRow';
import { Screen } from '@/src/components/Screen';
import { Segmented } from '@/src/components/Segmented';
import { APP_VERSION, APP_VERSION_LABEL } from '@/src/config/app-version';
import { BRAND } from '@/src/config/brand';
import { getAndroidUpdateInfo } from '@/modules/loofit-workout-core';
import {
  fetchAvailableAppUpdate,
  type AppUpdateInfo,
} from '@/src/services/app-update';
import {
  getStoredAuthSession,
  signOut,
} from '@/src/services/auth/native-auth';
import {
  isActionSuccessful,
  shouldDismissAfterAction,
  useAppStore,
} from '@/src/store/app-store';
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

const TERMS_URL = BRAND.urls.terms;
const PRIVACY_URL = BRAND.urls.privacy;
const CONTACT_EMAIL = BRAND.contactEmail;
const APP_UPDATE_LOOKUP_TIMEOUT_MS = 5_000;

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, mode, setMode, accent, setAccent } = useTheme();
  const { showToast } = useToast();
  const resetDevData = useAppStore((state) => state.resetDevData);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const openContactEmail = useCallback(async () => {
    const subject = encodeURIComponent(`[${BRAND.displayName}] 문의`);

    try {
      await Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${subject}`);
    } catch {
      Alert.alert('메일 앱을 열 수 없어요', `아래 주소로 문의해 주세요.\n${CONTACT_EMAIL}`);
    }
  }, []);
  const updateMode = useCallback(
    async (next: ThemeMode) => {
      await setMode(next);
    },
    [setMode]
  );
  const updateAccent = useCallback(
    async (next: string) => {
      await setAccent(next);
    },
    [setAccent]
  );
  const openAppUpdate = useCallback(async () => {
    if (!availableUpdate) {
      return;
    }

    try {
      await Linking.openURL(availableUpdate.storeUrl);
    } catch {
      Alert.alert(`${Platform.OS === 'android' ? 'Google Play' : 'App Store'}를 열 수 없어요`, '잠시 후 다시 시도해 주세요.');
    }
  }, [availableUpdate]);

  useEffect(() => {
    if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || !APP_VERSION) {
      return;
    }

    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), APP_UPDATE_LOOKUP_TIMEOUT_MS);

    const lookup = Platform.OS === 'android'
      ? getAndroidUpdateInfo().then((info) =>
          info.updateAvailable
            ? {
                version: '사용 가능',
                storeUrl: `https://play.google.com/store/apps/details?id=${encodeURIComponent(BRAND.playStore.packageName)}`,
              }
            : null
        )
      : fetchAvailableAppUpdate(APP_VERSION, { signal: controller.signal });

    void lookup
      .then((update) => {
        if (active) {
          setAvailableUpdate(update);
        }
      })
      .catch(() => {
        // Version lookup is optional and must not interrupt the settings screen.
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getStoredAuthSession()
        .then((session) => {
          if (active) {
            setIsSignedIn(session !== null);
          }
        })
        .catch(() => {
          if (active) {
            setIsSignedIn(false);
          }
        });
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <>
      <Screen title="설정">
        <Card padding={0} gap={0} style={styles.group}>
          <ListRow title="루틴 설정" chevron divider onPress={() => router.push('/routine')} />
          <ListRow title="위젯 둘러보기" chevron onPress={() => router.push('/widgets')} />
        </Card>

        {isSignedIn ? (
          <Card padding={0} gap={0} style={styles.group}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="로그아웃"
              onPress={() =>
                setConfirm({
                  title: '로그아웃할까요?',
                  description:
                    '현재 기기에서 로그아웃해요. 운동 기록과 루틴은 삭제되지 않아요.',
                  confirmLabel: '로그아웃',
                  onConfirm: async () => {
                    try {
                      const result = await signOut();
                      setIsSignedIn(false);
                      showToast(
                        result.serverSessionRevoked
                          ? '로그아웃했어요'
                          : '이 기기에서 로그아웃했어요'
                      );
                      return true;
                    } catch {
                      showToast('로그아웃하지 못했어요. 다시 시도해 주세요');
                      return false;
                    }
                  },
                })
              }
              style={styles.actionRow}>
              <AppText variant="item">로그아웃</AppText>
              <Icon name="logOut" size={18} color={colors.tx3} />
            </Pressable>
          </Card>
        ) : null}

        <Card padding={spacing.md} gap={spacing.md}>
          <View style={styles.subBlock}>
            <AppText variant="footnote" weight="700" tone="tertiary">
              테마
            </AppText>
            <Segmented options={MODE_OPTIONS} value={mode} onChange={updateMode} />
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
                    onPress={() => {
                      void updateAccent(option);
                    }}
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: option,
                        borderColor: selected ? colors.tx : 'transparent',
                      },
                    ]}>
                    {selected ? (
                      <Icon name="check" size={16} color={accentTextFor(option)} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Card>

        {availableUpdate ? (
          <Card gap={spacing.md} style={styles.updateCard}>
            <View style={styles.updateInfo}>
              <View style={[styles.updateIcon, { backgroundColor: colors.surface2 }]}>
                <Icon name="download" size={18} color={colors.accent} />
              </View>
              <View style={styles.updateCopy}>
                <AppText variant="item">새 버전 {availableUpdate.version}</AppText>
                <AppText variant="footnote" tone="tertiary" wordBreak>
                  최신 기능과 개선 사항을 사용할 수 있어요.
                </AppText>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`새 버전 ${availableUpdate.version}으로 업데이트`}
              onPress={() => void openAppUpdate()}
              style={({ pressed }) => [
                styles.updateAction,
                { backgroundColor: colors.accent },
                pressed ? styles.updatePressed : null,
              ]}>
              <AppText variant="body" weight="800" tone="accentContrast">
                {Platform.OS === 'android' ? 'Google Play에서 업데이트' : 'App Store에서 업데이트'}
              </AppText>
            </Pressable>
          </Card>
        ) : null}

        <Card padding={0} gap={0} style={styles.group}>
          <ListRow
            title="앱 정보"
            divider
            right={
              <AppText variant="body" tone="muted">
                {BRAND.displayName}
                {APP_VERSION_LABEL ? ` ${APP_VERSION_LABEL}` : ''}
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
                onConfirm: async () => {
                  const result = await resetDevData();
                  if (isActionSuccessful(result)) {
                    showToast('데이터를 초기화했어요');
                  }
                  return shouldDismissAfterAction(result);
                },
              })
            }
            style={styles.actionRow}>
            <AppText variant="item" tone="danger">
              로컬 데이터 초기화
            </AppText>
            <Icon name="trash" size={18} color={colors.danger} />
          </Pressable>
        </Card>

        <Card padding={0} gap={0} style={styles.group}>
          <ListRow
            title="문의하기"
            subtitle={CONTACT_EMAIL}
            chevron
            divider
            onPress={() => void openContactEmail()}
          />
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
            {BRAND.tagline}
          </AppText>
          <AppText variant="caption" weight="500" tone="hint">
            © {new Date().getFullYear()} {BRAND.displayName}. All rights reserved.
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
  updateCard: {
    overflow: 'hidden',
  },
  updateInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  updateIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  updateAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  updatePressed: {
    opacity: 0.85,
  },
  actionRow: {
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
