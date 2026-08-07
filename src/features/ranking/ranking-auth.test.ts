import { describe, expect, it, vi } from 'vitest';

import {
  AuthApiError,
  AuthRequiredError,
  AuthUnavailableError,
  type AuthSession,
} from '@/src/services/auth/auth-service';

import {
  rankingLoginErrorMessage,
  resolveRankingAuthState,
} from './ranking-auth';

const session: AuthSession = {
  version: 1,
  userId: 'user-1',
  accessToken: 'access-token',
  accessTokenExpiresAtEpochSeconds: 1_800_000_000,
  refreshToken: 'refresh-token',
  refreshTokenExpiresAtEpochSeconds: 1_900_000_000,
};

describe('ranking authentication state', () => {
  it('prompts signed-out users without calling the token endpoint', async () => {
    const getAccessToken = vi.fn();

    await expect(
      resolveRankingAuthState({
        getStoredSession: async () => null,
        getAccessToken,
      })
    ).resolves.toEqual({ status: 'signedOut' });
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('validates a stored session before showing ranking content', async () => {
    await expect(
      resolveRankingAuthState({
        getStoredSession: async () => session,
        getAccessToken: async () => 'access-token',
      })
    ).resolves.toEqual({ status: 'signedIn' });
  });

  it('returns to the login gate when refresh credentials are rejected', async () => {
    await expect(
      resolveRankingAuthState({
        getStoredSession: async () => session,
        getAccessToken: async () => {
          throw new AuthRequiredError();
        },
      })
    ).resolves.toEqual({ status: 'signedOut' });
  });

  it('keeps the stored session visible during a temporary network failure', async () => {
    const state = await resolveRankingAuthState({
      getStoredSession: async () => session,
      getAccessToken: async () => {
        throw new AuthUnavailableError();
      },
    });

    expect(state.status).toBe('signedIn');
    expect(state).toHaveProperty('warning');
  });

  it('maps provider and server errors to concise Korean guidance', () => {
    expect(rankingLoginErrorMessage(new Error('User cancelled'))).toBe(
      '카카오 로그인을 취소했어요.'
    );
    expect(
      rankingLoginErrorMessage(new AuthApiError(401, 'KAKAO_LOGIN_REJECTED'))
    ).toContain('카카오 계정');
    expect(rankingLoginErrorMessage(new AuthUnavailableError())).toContain(
      '연결 상태'
    );
    expect(
      rankingLoginErrorMessage(
        new AuthApiError(401, 'APPLE_LOGIN_REJECTED'),
        'apple'
      )
    ).toContain('Apple 계정');
    expect(
      rankingLoginErrorMessage(
        { code: 'ERR_REQUEST_CANCELED', message: 'Authorization failed.' },
        'apple'
      )
    ).toBe('Apple 로그인을 취소했어요.');
  });
});
