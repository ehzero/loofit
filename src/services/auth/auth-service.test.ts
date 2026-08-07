import { describe, expect, it, vi } from 'vitest';

import {
  AuthRequiredError,
  AuthUnavailableError,
  createAuthService,
  createSerializedAuthSessionStore,
  type AuthSession,
  type AuthSessionStore,
} from './auth-service';

const now = new Date('2026-08-07T00:00:00.000Z');
const nowEpochSeconds = Math.floor(now.getTime() / 1_000);

const createMemorySessionStore = (initial: AuthSession | null = null) => {
  let session = initial;
  const store: AuthSessionStore = {
    get: vi.fn(async () => session),
    set: vi.fn(async (next) => {
      session = next;
    }),
    clear: vi.fn(async () => {
      session = null;
    }),
  };
  return { store, read: () => session };
};

const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const tokenPair = {
  tokenType: 'Bearer',
  accessToken: 'access-new',
  expiresIn: 900,
  refreshToken: 'refresh-new',
  refreshTokenExpiresIn: 2_592_000,
};

describe('auth service', () => {
  it('exchanges a Kakao ID Token and stores only the Loofit session', async () => {
    const memory = createMemorySessionStore();
    const fetchImplementation = vi.fn(async () =>
      response(200, {
        ...tokenPair,
        user: { id: 'user-1', created: true },
      })
    );
    const service = createAuthService({
      apiBaseUrl: 'https://api.example.com/',
      sessionStore: memory.store,
      kakao: { login: vi.fn(async () => ({ idToken: 'kakao-id-token' })) },
      fetchImplementation,
      now: () => now,
    });

    const result = await service.signInWithKakao();

    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/v1/auth/kakao/exchange',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ idToken: 'kakao-id-token' }),
      })
    );
    expect(result.isNewUser).toBe(true);
    expect(memory.read()).toEqual({
      version: 1,
      userId: 'user-1',
      accessToken: 'access-new',
      accessTokenExpiresAtEpochSeconds: nowEpochSeconds + 900,
      refreshToken: 'refresh-new',
      refreshTokenExpiresAtEpochSeconds: nowEpochSeconds + 2_592_000,
    });
  });

  it('rejects Kakao login when OpenID Connect did not issue an ID Token', async () => {
    const memory = createMemorySessionStore();
    const service = createAuthService({
      apiBaseUrl: 'https://api.example.com',
      sessionStore: memory.store,
      kakao: { login: vi.fn(async () => ({ idToken: undefined })) },
      fetchImplementation: vi.fn(),
    });

    await expect(service.signInWithKakao()).rejects.toBeInstanceOf(
      AuthUnavailableError
    );
  });

  it('exchanges an Apple ID Token and nonce for the same Loofit session format', async () => {
    const memory = createMemorySessionStore();
    const fetchImplementation = vi.fn(async () =>
      response(200, {
        ...tokenPair,
        user: { id: 'apple-user-1', created: true },
      })
    );
    const service = createAuthService({
      apiBaseUrl: 'https://api.example.com',
      sessionStore: memory.store,
      kakao: { login: vi.fn() },
      apple: {
        login: vi.fn(async () => ({
          idToken: 'apple-id-token',
          nonce: '0123456789abcdef0123456789abcdef',
        })),
      },
      fetchImplementation,
      now: () => now,
    });

    await expect(service.signInWithApple()).resolves.toMatchObject({
      isNewUser: true,
      session: { userId: 'apple-user-1' },
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/v1/auth/apple/exchange',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          idToken: 'apple-id-token',
          nonce: '0123456789abcdef0123456789abcdef',
        }),
      })
    );
    expect(memory.read()?.refreshToken).toBe('refresh-new');
  });

  it('returns a valid access token without refreshing it', async () => {
    const memory = createMemorySessionStore({
      version: 1,
      userId: 'user-1',
      accessToken: 'access-current',
      accessTokenExpiresAtEpochSeconds: nowEpochSeconds + 300,
      refreshToken: 'refresh-current',
      refreshTokenExpiresAtEpochSeconds: nowEpochSeconds + 2_592_000,
    });
    const fetchImplementation = vi.fn();
    const service = createAuthService({
      apiBaseUrl: 'https://api.example.com',
      sessionStore: memory.store,
      kakao: { login: vi.fn() },
      fetchImplementation,
      now: () => now,
    });

    await expect(service.getAccessToken()).resolves.toBe('access-current');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('rotates an expiring refresh token and deduplicates concurrent requests', async () => {
    const memory = createMemorySessionStore({
      version: 1,
      userId: 'user-1',
      accessToken: 'access-expiring',
      accessTokenExpiresAtEpochSeconds: nowEpochSeconds + 30,
      refreshToken: 'refresh-current',
      refreshTokenExpiresAtEpochSeconds: nowEpochSeconds + 2_592_000,
    });
    const fetchImplementation = vi.fn(async () => response(200, tokenPair));
    const service = createAuthService({
      apiBaseUrl: 'https://api.example.com',
      sessionStore: memory.store,
      kakao: { login: vi.fn() },
      fetchImplementation,
      now: () => now,
    });

    await expect(
      Promise.all([service.getAccessToken(), service.getAccessToken()])
    ).resolves.toEqual(['access-new', 'access-new']);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/v1/auth/refresh',
      expect.objectContaining({
        body: JSON.stringify({ refreshToken: 'refresh-current' }),
      })
    );
    expect(memory.read()?.refreshToken).toBe('refresh-new');
  });

  it('clears a rejected session and requires a new login', async () => {
    const memory = createMemorySessionStore({
      version: 1,
      userId: 'user-1',
      accessToken: 'access-expired',
      accessTokenExpiresAtEpochSeconds: nowEpochSeconds - 1,
      refreshToken: 'refresh-replayed',
      refreshTokenExpiresAtEpochSeconds: nowEpochSeconds + 2_592_000,
    });
    const service = createAuthService({
      apiBaseUrl: 'https://api.example.com',
      sessionStore: memory.store,
      kakao: { login: vi.fn() },
      fetchImplementation: vi.fn(async () =>
        response(401, {
          error: { code: 'REFRESH_TOKEN_REJECTED', message: 'Rejected.' },
        })
      ),
      now: () => now,
    });

    await expect(service.getAccessToken()).rejects.toBeInstanceOf(
      AuthRequiredError
    );
    expect(memory.read()).toBeNull();
  });

  it('revokes the refresh session before clearing local credentials', async () => {
    const currentSession: AuthSession = {
      version: 1,
      userId: 'user-1',
      accessToken: 'access-current',
      accessTokenExpiresAtEpochSeconds: nowEpochSeconds + 300,
      refreshToken: 'refresh-current',
      refreshTokenExpiresAtEpochSeconds: nowEpochSeconds + 2_592_000,
    };
    const memory = createMemorySessionStore(currentSession);
    const fetchImplementation = vi.fn(async () => new Response(null, { status: 204 }));
    const service = createAuthService({
      apiBaseUrl: 'https://api.example.com',
      sessionStore: memory.store,
      kakao: { login: vi.fn() },
      fetchImplementation,
      now: () => now,
    });

    await expect(service.signOut()).resolves.toEqual({
      serverSessionRevoked: true,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://api.example.com/v1/auth/logout',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'refresh-current' }),
      })
    );
    expect(memory.read()).toBeNull();
  });

  it('clears local credentials when the logout API is unavailable', async () => {
    const memory = createMemorySessionStore({
      version: 1,
      userId: 'user-1',
      accessToken: 'access-current',
      accessTokenExpiresAtEpochSeconds: nowEpochSeconds + 300,
      refreshToken: 'refresh-current',
      refreshTokenExpiresAtEpochSeconds: nowEpochSeconds + 2_592_000,
    });
    const service = createAuthService({
      apiBaseUrl: 'https://api.example.com',
      sessionStore: memory.store,
      kakao: { login: vi.fn() },
      fetchImplementation: vi.fn(async () => {
        throw new TypeError('offline');
      }),
      now: () => now,
    });

    await expect(service.signOut()).resolves.toEqual({
      serverSessionRevoked: false,
    });
    expect(memory.read()).toBeNull();
  });
});

describe('serialized auth session store', () => {
  it('removes malformed stored values', async () => {
    let value: string | null = '{not-json';
    const store = createSerializedAuthSessionStore({
      get: async () => value,
      set: async (next) => {
        value = next;
      },
      clear: async () => {
        value = null;
      },
    });

    await expect(store.get()).resolves.toBeNull();
    expect(value).toBeNull();
  });
});
