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
  deleteAccount,
  getStoredAuthSession,
  signOut,
} from '@/src/services/auth/native-auth';
import { AuthApiError } from '@/src/services/auth/auth-service';
import {
  getWorkoutBackupStatus,
  restoreWorkoutBackup,
  WorkoutBackupChangedError,
  WorkoutBackupNotFoundError,
  type WorkoutBackupStatus,
} from '@/src/services/workout-sync/native-workout-backup';
import { requestWorkoutSync } from '@/src/services/workout-sync/workout-sync-events';
import { WorkoutRestoreActiveSessionError } from '@/src/db/repository';
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

const TERMS_URL = BRAND.urls.terms;
const PRIVACY_URL = BRAND.urls.privacy;
const CONTACT_EMAIL = BRAND.contactEmail;
const APP_UPDATE_LOOKUP_TIMEOUT_MS = 5_000;

const formatBackupTime = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const backupStatusDescription = (status: WorkoutBackupStatus | null): string => {
  if (!status) {
    return '백업 상태를 확인하고 있어요.';
  }
  if (status.kind === 'accountMismatch') {
    return '이전 계정에 연결된 로컬 기록은 새 계정으로 자동 이전하지 않아요.';
  }
  if (status.kind === 'restoreAvailable') {
    return status.localRecordCount > 0
      ? '서버 기록을 현재 기록과 합쳐서 가져올 수 있어요.'
      : '서버에 보관된 운동 기록을 이 기기로 가져올 수 있어요.';
  }
  if (status.kind === 'connected') {
    const formatted = formatBackupTime(status.lastBackupAt);
    return formatted ? `마지막 서버 백업 ${formatted}` : '서버 백업과 연결되어 있어요.';
  }
  return status.localRecordCount > 0
    ? '운동 기록을 서버에 백업할 준비를 하고 있어요.'
    : '운동 기록이 생기면 자동으로 백업해요.';
};

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, mode, setMode, accent, setAccent } = useTheme();
  const { showToast } = useToast();
  const refreshApp = useAppStore((state) => state.refresh);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [backupStatus, setBackupStatus] = useState<WorkoutBackupStatus | null>(null);
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [hasBackupStatusError, setHasBackupStatusError] = useState(false);
  const loadBackupStatus = useCallback(async () => {
    setIsBackupLoading(true);
    setHasBackupStatusError(false);
    try {
      setBackupStatus(await getWorkoutBackupStatus());
    } catch {
      setBackupStatus(null);
      setHasBackupStatusError(true);
    } finally {
      setIsBackupLoading(false);
    }
  }, []);
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
            if (session) {
              void loadBackupStatus();
            } else {
              setBackupStatus(null);
              setHasBackupStatusError(false);
            }
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
    }, [loadBackupStatus])
  );

  return (
    <>
      <Screen title="설정">
        <Card padding={0} gap={0} style={styles.group}>
          <ListRow title="루틴 설정" chevron divider onPress={() => router.push('/routine')} />
          <ListRow title="위젯 둘러보기" chevron onPress={() => router.push('/widgets')} />
        </Card>

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

        {isSignedIn ? (
          <Card gap={spacing.md} style={styles.backupCard}>
            <View style={styles.updateInfo}>
              <View style={[styles.updateIcon, { backgroundColor: colors.surface2 }]}>
                <Icon name="cloud" size={18} color={colors.accent} />
              </View>
              <View style={styles.updateCopy}>
                <AppText variant="item">클라우드 백업</AppText>
                <AppText variant="footnote" tone="tertiary" wordBreak>
                  {hasBackupStatusError
                    ? '백업 상태를 확인하지 못했어요.'
                    : backupStatusDescription(backupStatus)}
                </AppText>
              </View>
            </View>
            {hasBackupStatusError ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="클라우드 백업 상태 다시 확인"
                disabled={isBackupLoading}
                onPress={() => void loadBackupStatus()}
                style={({ pressed }) => [
                  styles.updateAction,
                  { backgroundColor: colors.accent },
                  pressed ? styles.updatePressed : null,
                  isBackupLoading ? styles.backupDisabled : null,
                ]}>
                <AppText variant="body" weight="800" tone="accentContrast">
                  다시 확인
                </AppText>
              </Pressable>
            ) : backupStatus?.kind === 'restoreAvailable' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="백업에서 운동 기록 가져오기"
                disabled={isBackupLoading || backupStatus.hasActiveSession}
                onPress={() =>
                  setConfirm({
                    title: '백업 기록을 가져올까요?',
                    description: backupStatus.hasActiveSession
                      ? '진행 중인 운동을 종료한 뒤 기록을 가져올 수 있어요.'
                      : '서버에 보관된 운동 기록을 현재 기록과 합쳐요. 루틴 설정과 다음 운동 위치는 바뀌지 않아요.',
                    confirmLabel: '기록 가져오기',
                    onConfirm: async () => {
                      try {
                        const result = await restoreWorkoutBackup();
                        await refreshApp();
                        requestWorkoutSync();
                        await loadBackupStatus();
                        showToast(
                          result.added + result.updated + result.deleted > 0
                            ? '백업 기록을 가져왔어요'
                            : '이미 최신 백업이 적용되어 있어요'
                        );
                        return true;
                      } catch (error) {
                        if (error instanceof WorkoutRestoreActiveSessionError) {
                          showToast('진행 중인 운동을 종료한 뒤 다시 시도해 주세요');
                        } else if (error instanceof WorkoutBackupChangedError) {
                          showToast('백업이 갱신됐어요. 다시 시도해 주세요');
                        } else if (error instanceof WorkoutBackupNotFoundError) {
                          showToast('가져올 백업 기록이 없어요');
                        } else {
                          showToast('백업 기록을 가져오지 못했어요. 다시 시도해 주세요');
                        }
                        return false;
                      }
                    },
                  })
                }
                style={({ pressed }) => [
                  styles.updateAction,
                  { backgroundColor: colors.accent },
                  pressed ? styles.updatePressed : null,
                  isBackupLoading || backupStatus.hasActiveSession
                    ? styles.backupDisabled
                    : null,
                ]}>
                <AppText variant="body" weight="800" tone="accentContrast">
                  {backupStatus.hasActiveSession
                    ? '운동 종료 후 가져오기'
                    : '백업에서 기록 가져오기'}
                </AppText>
              </Pressable>
            ) : null}
          </Card>
        ) : null}

        <Card padding={0} gap={0} style={styles.group}>
          <ListRow
            title="앱 정보"
            divider={isSignedIn}
            right={
              <AppText variant="body" tone="muted">
                {BRAND.displayName}
                {APP_VERSION_LABEL ? ` ${APP_VERSION_LABEL}` : ''}
              </AppText>
            }
          />
          {isSignedIn ? (
            <>
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
                        setBackupStatus(null);
                        setHasBackupStatusError(false);
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
                style={[
                  styles.actionRow,
                  {
                    borderBottomColor: colors.line,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                ]}>
                <AppText variant="item">로그아웃</AppText>
                <Icon name="logOut" size={18} color={colors.tx3} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="회원 탈퇴"
                onPress={() =>
                  setConfirm({
                    title: '회원 탈퇴할까요?',
                    description:
                      '루핏 계정과 서버 백업, 랭킹 데이터가 영구 삭제되고 소셜 계정 연결이 해제돼요. 현재 기기의 운동 기록과 루틴은 유지되며, 삭제한 서버 데이터는 복구할 수 없어요.',
                    confirmLabel: '회원 탈퇴',
                    danger: true,
                    onConfirm: async () => {
                      try {
                        await deleteAccount();
                        setIsSignedIn(false);
                        setBackupStatus(null);
                        setHasBackupStatusError(false);
                        showToast('회원 탈퇴 요청이 접수됐어요');
                        return true;
                      } catch (error) {
                        if (
                          error instanceof AuthApiError &&
                          error.code === 'ACCOUNT_REAUTHENTICATION_REJECTED'
                        ) {
                          showToast('소셜 계정 본인 확인에 실패했어요');
                        } else if (
                          error instanceof AuthApiError &&
                          error.code === 'AUTH_PROVIDER_UNAVAILABLE'
                        ) {
                          showToast('소셜 로그인 연결이 원활하지 않아요');
                        } else {
                          showToast('회원 탈퇴를 완료하지 못했어요. 다시 시도해 주세요');
                        }
                        return false;
                      }
                    },
                  })
                }
                style={styles.actionRow}>
                <AppText variant="item" tone="danger">
                  회원 탈퇴
                </AppText>
                <Icon name="userMinus" size={18} color={colors.danger} />
              </Pressable>
            </>
          ) : null}
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
  backupCard: {
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
  backupDisabled: {
    opacity: 0.45,
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
