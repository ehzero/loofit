import {
  AuthApiError,
  AuthRequiredError,
  AuthUnavailableError,
  type AuthSession,
} from '@/src/services/auth/auth-service';

export type RankingAuthState =
  | { status: 'signedOut' }
  | { status: 'signedIn'; warning?: string }
  | { status: 'unavailable'; message: string };

export type SocialLoginProvider = 'kakao' | 'apple';

type RankingAuthDependencies = {
  getStoredSession: () => Promise<AuthSession | null>;
  getAccessToken: () => Promise<string>;
};

const SESSION_CHECK_ERROR =
  '로그인 상태를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.';
const CONNECTION_WARNING =
  '네트워크 연결을 확인하지 못했어요. 저장된 로그인 상태로 화면을 표시합니다.';

export const resolveRankingAuthState = async (
  dependencies: RankingAuthDependencies
): Promise<RankingAuthState> => {
  let session: AuthSession | null;
  try {
    session = await dependencies.getStoredSession();
  } catch {
    return { status: 'unavailable', message: SESSION_CHECK_ERROR };
  }

  if (session === null) {
    return { status: 'signedOut' };
  }

  try {
    await dependencies.getAccessToken();
    return { status: 'signedIn' };
  } catch (error: unknown) {
    if (error instanceof AuthRequiredError) {
      return { status: 'signedOut' };
    }
    return { status: 'signedIn', warning: CONNECTION_WARNING };
  }
};

const errorDescription = (error: unknown): string => {
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null) {
    const details: string[] = [];
    if ('code' in error && typeof error.code === 'string') {
      details.push(error.code);
    }
    if ('message' in error && typeof error.message === 'string') {
      details.push(error.message);
    }
    return details.join(' ');
  }
  return '';
};

export const rankingLoginErrorMessage = (
  error: unknown,
  provider: SocialLoginProvider = 'kakao'
): string => {
  const providerName = provider === 'apple' ? 'Apple' : '카카오';
  const message = errorDescription(error).toLocaleLowerCase();
  if (message.includes('cancel') || message.includes('취소')) {
    return `${providerName} 로그인을 취소했어요.`;
  }
  if (error instanceof AuthApiError) {
    if (error.code === 'KAKAO_LOGIN_REJECTED') {
      return '카카오 계정을 확인하지 못했어요. 다시 로그인해 주세요.';
    }
    if (error.code === 'APPLE_LOGIN_REJECTED') {
      return 'Apple 계정을 확인하지 못했어요. 다시 로그인해 주세요.';
    }
    if (error.code === 'AUTH_TEMPORARILY_UNAVAILABLE') {
      return '로그인 서버에 잠시 연결할 수 없어요. 조금 뒤 다시 시도해 주세요.';
    }
  }
  if (error instanceof AuthUnavailableError) {
    return `${providerName} 로그인을 시작할 수 없어요. 연결 상태를 확인해 주세요.`;
  }
  return '로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';
};
