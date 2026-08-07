export const AUTH_SESSION_VERSION = 1 as const;

export type AuthSession = {
  version: typeof AUTH_SESSION_VERSION;
  userId: string;
  accessToken: string;
  accessTokenExpiresAtEpochSeconds: number;
  refreshToken: string;
  refreshTokenExpiresAtEpochSeconds: number;
};

export type AuthSessionStore = {
  get(): Promise<AuthSession | null>;
  set(session: AuthSession): Promise<void>;
  clear(): Promise<void>;
};

export type SecretValueStore = {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  clear(): Promise<void>;
};

export type KakaoIdTokenProvider = {
  login(): Promise<{ idToken?: string | null }>;
};

type FetchImplementation = typeof fetch;

export type AuthServiceOptions = {
  apiBaseUrl: string;
  sessionStore: AuthSessionStore;
  kakao: KakaoIdTokenProvider;
  fetchImplementation?: FetchImplementation;
  now?: () => Date;
  accessTokenRefreshLeewaySeconds?: number;
};

export type KakaoSignInResult = {
  session: AuthSession;
  isNewUser: boolean;
};

export class AuthRequiredError extends Error {
  constructor() {
    super('Authentication is required.');
    this.name = 'AuthRequiredError';
  }
}

export class AuthUnavailableError extends Error {
  constructor(message = 'Authentication is temporarily unavailable.') {
    super(message);
    this.name = 'AuthUnavailableError';
  }
}

export class AuthApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(`Authentication API request failed with ${code}.`);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export const isAuthSession = (value: unknown): value is AuthSession =>
  isRecord(value) &&
  value.version === AUTH_SESSION_VERSION &&
  isNonEmptyString(value.userId) &&
  isNonEmptyString(value.accessToken) &&
  isPositiveInteger(value.accessTokenExpiresAtEpochSeconds) &&
  isNonEmptyString(value.refreshToken) &&
  isPositiveInteger(value.refreshTokenExpiresAtEpochSeconds);

export const createSerializedAuthSessionStore = (
  secretStore: SecretValueStore
): AuthSessionStore => ({
  async get() {
    const serialized = await secretStore.get();
    if (serialized === null) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(serialized);
      if (isAuthSession(parsed)) {
        return parsed;
      }
    } catch {
      // Invalid values are removed below so every caller observes signed-out state.
    }

    await secretStore.clear();
    return null;
  },
  set(session) {
    return secretStore.set(JSON.stringify(session));
  },
  clear() {
    return secretStore.clear();
  },
});

type TokenPairResponse = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
};

const parseTokenPair = (value: unknown): TokenPairResponse => {
  if (
    !isRecord(value) ||
    value.tokenType !== 'Bearer' ||
    !isNonEmptyString(value.accessToken) ||
    !isPositiveInteger(value.expiresIn) ||
    !isNonEmptyString(value.refreshToken) ||
    !isPositiveInteger(value.refreshTokenExpiresIn)
  ) {
    throw new AuthUnavailableError('The authentication response was invalid.');
  }

  return {
    accessToken: value.accessToken,
    expiresIn: value.expiresIn,
    refreshToken: value.refreshToken,
    refreshTokenExpiresIn: value.refreshTokenExpiresIn,
  };
};

const parseErrorCode = (value: unknown): string =>
  isRecord(value) &&
  isRecord(value.error) &&
  isNonEmptyString(value.error.code)
    ? value.error.code
    : 'UNKNOWN_AUTH_ERROR';

const parseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const toSession = (
  tokenPair: TokenPairResponse,
  userId: string,
  nowEpochSeconds: number
): AuthSession => ({
  version: AUTH_SESSION_VERSION,
  userId,
  accessToken: tokenPair.accessToken,
  accessTokenExpiresAtEpochSeconds: nowEpochSeconds + tokenPair.expiresIn,
  refreshToken: tokenPair.refreshToken,
  refreshTokenExpiresAtEpochSeconds:
    nowEpochSeconds + tokenPair.refreshTokenExpiresIn,
});

export const createAuthService = (options: AuthServiceOptions) => {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const now = options.now ?? (() => new Date());
  const refreshLeeway = options.accessTokenRefreshLeewaySeconds ?? 60;
  const apiBaseUrl = options.apiBaseUrl.replace(/\/$/, '');
  let refreshInFlight: Promise<AuthSession> | null = null;

  if (apiBaseUrl.length === 0) {
    throw new Error('apiBaseUrl is required.');
  }
  if (!Number.isSafeInteger(refreshLeeway) || refreshLeeway < 0) {
    throw new Error('accessTokenRefreshLeewaySeconds must be a non-negative integer.');
  }

  const request = async (path: string, body: unknown): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchImplementation(`${apiBaseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AuthUnavailableError();
    }

    const responseBody = await parseJson(response);
    if (!response.ok) {
      throw new AuthApiError(response.status, parseErrorCode(responseBody));
    }
    return responseBody;
  };

  const refresh = (current: AuthSession): Promise<AuthSession> => {
    if (refreshInFlight !== null) {
      return refreshInFlight;
    }

    refreshInFlight = (async () => {
      try {
        const response = await request('/v1/auth/refresh', {
          refreshToken: current.refreshToken,
        });
        const tokenPair = parseTokenPair(response);
        const refreshed = toSession(
          tokenPair,
          current.userId,
          Math.floor(now().getTime() / 1_000)
        );
        await options.sessionStore.set(refreshed);
        return refreshed;
      } catch (error: unknown) {
        if (error instanceof AuthApiError && error.status === 401) {
          await options.sessionStore.clear();
          throw new AuthRequiredError();
        }
        throw error;
      }
    })().finally(() => {
      refreshInFlight = null;
    });

    return refreshInFlight;
  };

  return {
    async signInWithKakao(): Promise<KakaoSignInResult> {
      const kakaoToken = await options.kakao.login();
      if (!isNonEmptyString(kakaoToken.idToken)) {
        throw new AuthUnavailableError(
          'Kakao OpenID Connect ID Token was not issued.'
        );
      }

      const response = await request('/v1/auth/kakao/exchange', {
        idToken: kakaoToken.idToken,
      });
      if (
        !isRecord(response) ||
        !isRecord(response.user) ||
        !isNonEmptyString(response.user.id) ||
        typeof response.user.created !== 'boolean'
      ) {
        throw new AuthUnavailableError('The authentication response was invalid.');
      }

      const session = toSession(
        parseTokenPair(response),
        response.user.id,
        Math.floor(now().getTime() / 1_000)
      );
      await options.sessionStore.set(session);
      return { session, isNewUser: response.user.created };
    },

    getCurrentSession(): Promise<AuthSession | null> {
      return options.sessionStore.get();
    },

    async getAccessToken(): Promise<string> {
      const session = await options.sessionStore.get();
      if (session === null) {
        throw new AuthRequiredError();
      }

      const nowEpochSeconds = Math.floor(now().getTime() / 1_000);
      if (
        session.accessTokenExpiresAtEpochSeconds - nowEpochSeconds >
        refreshLeeway
      ) {
        return session.accessToken;
      }

      return (await refresh(session)).accessToken;
    },
  };
};
