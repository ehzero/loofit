import * as AppleAuthentication from 'expo-apple-authentication';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { AppText } from '@/src/components/AppText';
import { Button } from '@/src/components/Button';
import { Callout } from '@/src/components/Callout';
import { Card } from '@/src/components/Card';
import { EmptyState } from '@/src/components/EmptyState';
import { Icon, type IconName } from '@/src/components/Icon';
import { Screen } from '@/src/components/Screen';
import { StatTiles } from '@/src/components/StatTiles';
import { BRAND } from '@/src/config/brand';
import {
  rankingLoginErrorMessage,
  resolveRankingAuthState,
  type RankingAuthState,
  type SocialLoginProvider,
} from '@/src/features/ranking/ranking-auth';
import {
  getLoofitAccessToken,
  getStoredAuthSession,
  isAppleSignInAvailable,
  signInWithApple,
  signInWithKakao,
} from '@/src/services/auth/native-auth';
import {
  getCurrentWeeklyLeaderboard,
  type WeeklyLeaderboard,
  type WeeklyLeaderboardEntry,
} from '@/src/services/ranking/weekly-leaderboard';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/theme/ToastProvider';
import { radius, spacing } from '@/src/theme/tokens';

type ScreenAuthState = { status: 'checking' } | RankingAuthState;
type LeaderboardLoadState = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

const formatDuration = (seconds: number): string => {
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}분`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
};

const formatPeriod = (leaderboard: WeeklyLeaderboard): string => {
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    timeZone: leaderboard.period.timeZone,
  });
  const startsAt = formatter.format(new Date(leaderboard.period.startsAt));
  const endsAt = formatter.format(
    new Date(Date.parse(leaderboard.period.endsAt) - 1)
  );
  return `${startsAt}–${endsAt}`;
};

export default function RankingScreen() {
  const { colors, scheme } = useTheme();
  const { showToast } = useToast();
  const [authState, setAuthState] = useState<ScreenAuthState>({
    status: 'checking',
  });
  const [loginProvider, setLoginProvider] =
    useState<SocialLoginProvider | null>(null);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<WeeklyLeaderboard | null>(null);
  const [leaderboardLoadState, setLeaderboardLoadState] =
    useState<LeaderboardLoadState>('idle');

  const checkAuthentication = useCallback(async () => {
    return resolveRankingAuthState({
      getStoredSession: getStoredAuthSession,
      getAccessToken: getLoofitAccessToken,
    });
  }, []);

  const loadLeaderboard = useCallback(async (refreshing = false) => {
    setLeaderboardLoadState(refreshing ? 'refreshing' : 'loading');
    try {
      setLeaderboard(await getCurrentWeeklyLeaderboard());
      setLeaderboardLoadState('ready');
    } catch {
      setLeaderboardLoadState('error');
    }
  }, []);

  useEffect(() => {
    let active = true;
    void isAppleSignInAvailable()
      .then((available) => {
        if (active) {
          setIsAppleAvailable(available);
        }
      })
      .catch(() => {
        if (active) {
          setIsAppleAvailable(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setAuthState({ status: 'checking' });
      void checkAuthentication().then((state) => {
        if (!active) {
          return;
        }
        setAuthState(state);
        if (state.status === 'signedIn') {
          void loadLeaderboard();
        } else {
          setLeaderboard(null);
          setLeaderboardLoadState('idle');
        }
      });
      return () => {
        active = false;
      };
    }, [checkAuthentication, loadLeaderboard])
  );

  const handleSocialLogin = useCallback(
    async (provider: SocialLoginProvider) => {
      if (loginProvider !== null) {
        return;
      }
      setLoginProvider(provider);
      setLoginError(null);
      try {
        const result =
          provider === 'apple'
            ? await signInWithApple()
            : await signInWithKakao();
        setAuthState({ status: 'signedIn' });
        showToast(
          result.isNewUser
            ? `${provider === 'apple' ? 'Apple' : '카카오'} 계정으로 루핏을 시작했어요`
            : `${provider === 'apple' ? 'Apple' : '카카오'} 계정으로 로그인했어요`
        );
        await loadLeaderboard();
      } catch (error: unknown) {
        setLoginError(rankingLoginErrorMessage(error, provider));
      } finally {
        setLoginProvider(null);
      }
    },
    [loadLeaderboard, loginProvider, showToast]
  );

  if (authState.status === 'checking') {
    return <Screen title="랭킹" isLoading />;
  }

  if (authState.status === 'unavailable') {
    return (
      <Screen title="랭킹">
        <Card gap={spacing.md} style={styles.centerCard}>
          <View style={[styles.iconCircle, { backgroundColor: colors.surface2 }]}>
            <Icon name="info" size={28} color={colors.tx3} />
          </View>
          <View style={styles.centerCopy}>
            <AppText variant="title">로그인 상태를 확인할 수 없어요</AppText>
            <AppText variant="body" tone="tertiary" wordBreak>
              {authState.message}
            </AppText>
          </View>
          <Button
            variant="neutral"
            onPress={() => {
              setAuthState({ status: 'checking' });
              void checkAuthentication().then(setAuthState);
            }}>
            다시 시도
          </Button>
        </Card>
      </Screen>
    );
  }

  if (authState.status === 'signedOut') {
    return (
      <Screen title="랭킹">
        <Card variant="hero" style={styles.loginHero}>
          <RankingPreview />
          <View style={styles.heroCopy}>
            <AppText variant="heading" wordBreak>
              이번 주, 나는 얼마나 꾸준했을까요?
            </AppText>
            <AppText variant="body" tone="tertiary" wordBreak>
              간편하게 로그인하고 내 운동 기록이 어디쯤인지 확인해 보세요.
            </AppText>
          </View>
        </Card>

        <Card gap={0} padding={0}>
          <BenefitRow
            icon="ranking"
            title="내 순위 한눈에"
            description="이번 주 나의 운동 기록과 전체 순위를 확인해요."
            divider
          />
          <BenefitRow
            icon="bolt"
            title="매주 새로운 동기"
            description="새롭게 시작되는 랭킹으로 꾸준한 운동 습관을 만들어요."
          />
        </Card>

        <View style={styles.loginActions}>
          {isAppleAvailable ? (
            <View
              pointerEvents={loginProvider === null ? 'auto' : 'none'}
              style={loginProvider !== null ? styles.loginDisabled : null}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={
                  scheme === 'dark'
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={radius.md}
                style={styles.appleLoginButton}
                onPress={() => void handleSocialLogin('apple')}
              />
            </View>
          ) : null}
          <Button
            variant="kakao"
            leadingIcon={
              <Image
                source={require('../../assets/images/kakao-login-symbol.png')}
                style={styles.kakaoLoginSymbol}
              />
            }
            disabled={loginProvider !== null}
            onPress={() => void handleSocialLogin('kakao')}>
            {loginProvider === 'kakao'
              ? '카카오 로그인 중...'
              : '카카오로 로그인'}
          </Button>
          {loginError ? (
            <AppText
              accessibilityRole="alert"
              variant="footnote"
              tone="danger"
              wordBreak
              style={styles.loginError}>
              {loginError}
            </AppText>
          ) : null}
          <AppText variant="caption" tone="hint" style={styles.participationNotice}>
            로그인하면 익명으로 주간 랭킹에 자동 참여해요.
          </AppText>
          <LegalLinks />
        </View>
      </Screen>
    );
  }

  if (leaderboardLoadState === 'loading' && !leaderboard) {
    return <Screen title="랭킹" isLoading />;
  }

  if (!leaderboard) {
    return (
      <Screen title="랭킹">
        {authState.warning ? (
          <Callout icon="info">{authState.warning}</Callout>
        ) : null}
        <Card gap={spacing.md} style={styles.centerCard}>
          <View style={[styles.iconCircle, { backgroundColor: colors.surface2 }]}>
            <Icon name="info" size={28} color={colors.tx3} />
          </View>
          <View style={styles.centerCopy}>
            <AppText variant="title">랭킹을 불러오지 못했어요</AppText>
            <AppText variant="body" tone="tertiary" wordBreak>
              네트워크 상태를 확인하고 다시 시도해 주세요.
            </AppText>
          </View>
          <Button variant="neutral" onPress={() => void loadLeaderboard()}>
            다시 시도
          </Button>
        </Card>
      </Screen>
    );
  }

  const me = leaderboard.me;
  const meIsInTopEntries = leaderboard.entries.some((entry) => entry.isMe);
  return (
    <Screen
      title="랭킹"
      refreshControl={
        <RefreshControl
          refreshing={leaderboardLoadState === 'refreshing'}
          tintColor={colors.accent}
          onRefresh={() => void loadLeaderboard(true)}
        />
      }>
      {authState.warning ? (
        <Callout icon="info">{authState.warning}</Callout>
      ) : null}
      {leaderboardLoadState === 'error' ? (
        <Callout icon="info">최신 랭킹을 불러오지 못해 이전 결과를 표시해요.</Callout>
      ) : null}

      <Card variant="hero">
        <View style={styles.readyHeader}>
          <View style={[styles.readyIcon, { backgroundColor: colors.accent }]}>
            <Icon name="ranking" size={22} color={colors.accentText} />
          </View>
          <AppText variant="label" tone="accent">
            {formatPeriod(leaderboard)}
          </AppText>
        </View>
        <View style={styles.heroCopy}>
          <AppText variant="heading" wordBreak>
            {me ? `이번 주 ${me.rank}위예요` : '첫 집계를 기다리고 있어요'}
          </AppText>
          <AppText variant="body" tone="tertiary" wordBreak>
            {me
              ? `${me.activeDays}일 · ${formatDuration(me.totalDurationSeconds)} · ${me.workoutCount}회`
              : '하루 완료 운동 합계가 5분 이상이면 자동으로 랭킹에 반영돼요.'}
          </AppText>
        </View>
      </Card>

      <StatTiles
        tiles={[
          { label: '내 순위', value: me ? `${me.rank}위` : '—' },
          { label: '운동한 날', value: me ? `${me.activeDays}일` : '0일' },
        ]}
      />

      {me && !meIsInTopEntries ? (
        <Card padding={0} gap={0}>
          <View style={styles.rankingSectionHeader}>
            <AppText variant="label" tone="muted">
              내 랭킹
            </AppText>
          </View>
          <LeaderboardRow entry={me} isLast />
        </Card>
      ) : null}

      <Card padding={0} gap={0}>
        <View style={styles.rankingSectionHeader}>
          <AppText variant="label" tone="muted">
            전체 랭킹
          </AppText>
        </View>
        {leaderboard.entries.length > 0 ? (
          leaderboard.entries.map((entry, index) => (
            <LeaderboardRow
              key={`${entry.rank}-${entry.displayName}-${index}`}
              entry={entry}
              isLast={index === leaderboard.entries.length - 1}
            />
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <EmptyState
              title="아직 집계된 랭킹이 없어요"
              description="이번 주 첫 운동을 완료하고 랭킹을 시작해 보세요."
            />
          </View>
        )}
      </Card>

      <AppText variant="caption" tone="hint" style={styles.policyNote}>
        완료 운동을 기준으로 매주 월요일 새로 시작해요. 하루 5분 이상을 1일로
        인정하고, 같은 일수에서는 하루 최대 2시간의 운동 시간으로 순위를 정해요.
      </AppText>
    </Screen>
  );
}

function LeaderboardRow({
  entry,
  isLast,
}: {
  entry: WeeklyLeaderboardEntry;
  isLast: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.rankingRow,
        entry.isMe ? { backgroundColor: colors.surface2 } : null,
        !isLast
          ? {
              borderBottomColor: colors.line,
              borderBottomWidth: StyleSheet.hairlineWidth,
            }
          : null,
      ]}>
      <View
        style={[
          styles.rankBadge,
          entry.rank <= 3 ? { backgroundColor: colors.accent } : null,
        ]}>
        <AppText
          variant="item"
          tone={entry.rank <= 3 ? 'accentContrast' : 'muted'}>
          {entry.rank}
        </AppText>
      </View>
      <View style={styles.rankingCopy}>
        <AppText variant="item">{entry.isMe ? '나' : entry.displayName}</AppText>
        <AppText variant="footnote" tone="tertiary">
          {entry.activeDays}일 · {formatDuration(entry.totalDurationSeconds)} ·{' '}
          {entry.workoutCount}회
        </AppText>
      </View>
    </View>
  );
}

function RankingPreview() {
  const { colors } = useTheme();
  return (
    <View
      style={styles.preview}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View style={styles.podiumRow}>
        <View
          style={[
            styles.podium,
            styles.podiumSecond,
            { backgroundColor: colors.surface2, borderColor: colors.border2 },
          ]}>
          <AppText variant="title" tone="muted">
            2
          </AppText>
        </View>
        <View
          style={[
            styles.podium,
            styles.podiumFirst,
            { backgroundColor: colors.accent },
          ]}>
          <Icon name="ranking" size={24} color={colors.accentText} />
          <AppText variant="title" tone="accentContrast">
            1
          </AppText>
        </View>
        <View
          style={[
            styles.podium,
            styles.podiumThird,
            { backgroundColor: colors.surface2, borderColor: colors.border2 },
          ]}>
          <AppText variant="title" tone="muted">
            3
          </AppText>
        </View>
      </View>
    </View>
  );
}

function BenefitRow({
  icon,
  title,
  description,
  divider,
}: {
  icon: IconName;
  title: string;
  description: string;
  divider?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.benefit,
        divider
          ? {
              borderBottomColor: colors.line,
              borderBottomWidth: StyleSheet.hairlineWidth,
            }
          : null,
      ]}>
      <View style={[styles.benefitIcon, { backgroundColor: colors.surface2 }]}>
        <Icon name={icon} size={20} color={colors.accent} />
      </View>
      <View style={styles.benefitCopy}>
        <AppText variant="item">{title}</AppText>
        <AppText variant="footnote" tone="tertiary" wordBreak>
          {description}
        </AppText>
      </View>
    </View>
  );
}

function LegalLinks() {
  return (
    <View style={styles.legalLinks}>
      <Pressable
        onPress={() => void WebBrowser.openBrowserAsync(BRAND.urls.terms)}
        hitSlop={8}>
        <AppText variant="label" tone="muted">
          이용약관
        </AppText>
      </Pressable>
      <AppText variant="caption" tone="hint">
        ·
      </AppText>
      <Pressable
        onPress={() => void WebBrowser.openBrowserAsync(BRAND.urls.privacy)}
        hitSlop={8}>
        <AppText variant="label" tone="muted">
          개인정보 처리방침
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centerCard: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  centerCopy: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginHero: {
    paddingTop: spacing.xl,
  },
  preview: {
    height: 132,
    justifyContent: 'flex-end',
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  podium: {
    width: 72,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  podiumFirst: {
    height: 108,
    gap: spacing.xxs,
    borderWidth: 0,
  },
  podiumSecond: {
    height: 76,
  },
  podiumThird: {
    height: 60,
  },
  heroCopy: {
    gap: spacing.xs,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  loginActions: {
    gap: spacing.sm,
  },
  appleLoginButton: {
    width: '100%',
    height: 44,
  },
  kakaoLoginSymbol: {
    width: 16,
    height: 16,
  },
  loginDisabled: {
    opacity: 0.4,
  },
  loginError: {
    textAlign: 'center',
  },
  participationNotice: {
    textAlign: 'center',
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  readyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  readyIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankingSectionHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  rankingRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankingCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  emptyContainer: {
    padding: spacing.md,
  },
  policyNote: {
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
});
