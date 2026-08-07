import { timingSafeEqual } from 'node:crypto';

import type { JWTVerifyGetKey } from 'jose' with { 'resolution-mode': 'import' };

import {
  KakaoConfigurationError,
  type KakaoAuthConfig,
  type KakaoRestAuthConfig,
} from './kakao-config';

const KAKAO_TOKEN_ENDPOINT = 'https://kauth.kakao.com/oauth/token';
const KAKAO_ISSUER = 'https://kauth.kakao.com';
const KAKAO_JWKS_URL = new URL(
  'https://kauth.kakao.com/.well-known/jwks.json'
);

export type KakaoAuthorizationCodeInput = {
  code: string;
  redirectUri: string;
  nonce: string;
};

export type KakaoNativeIdTokenInput = {
  idToken: string;
};

export type KakaoAuthenticationInput =
  | KakaoAuthorizationCodeInput
  | KakaoNativeIdTokenInput;

export type KakaoIdentity = {
  subject: string;
};

export class KakaoLoginRejectedError extends Error {
  constructor(message = 'Kakao login was rejected.') {
    super(message);
    this.name = 'KakaoLoginRejectedError';
  }
}

export class KakaoProviderUnavailableError extends Error {
  constructor() {
    super('Kakao authentication is temporarily unavailable.');
    this.name = 'KakaoProviderUnavailableError';
  }
}

export class KakaoRedirectUriRejectedError extends Error {
  constructor() {
    super('Kakao redirect URI is not allowed.');
    this.name = 'KakaoRedirectUriRejectedError';
  }
}

type Fetch = typeof fetch;

type KakaoTokenResponse = {
  id_token?: unknown;
};

const parseTokenResponse = async (response: Response): Promise<KakaoTokenResponse> => {
  try {
    const value: unknown = await response.json();
    return typeof value === 'object' && value !== null
      ? (value as KakaoTokenResponse)
      : {};
  } catch {
    return {};
  }
};

export const exchangeKakaoAuthorizationCode = async (
  config: KakaoRestAuthConfig,
  input: KakaoAuthorizationCodeInput,
  fetchImplementation: Fetch = fetch
): Promise<string> => {
  if (!config.redirectUris.includes(input.redirectUri)) {
    throw new KakaoRedirectUriRejectedError();
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  });

  let response: Response;
  try {
    response = await fetchImplementation(KAKAO_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new KakaoProviderUnavailableError();
  }

  const tokenResponse = await parseTokenResponse(response);
  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      throw new KakaoProviderUnavailableError();
    }
    throw new KakaoLoginRejectedError();
  }
  if (
    typeof tokenResponse.id_token !== 'string' ||
    tokenResponse.id_token.length === 0
  ) {
    throw new KakaoLoginRejectedError(
      'Kakao OpenID Connect ID token was not issued.'
    );
  }
  return tokenResponse.id_token;
};

const sameNonce = (actual: unknown, expected: string): boolean => {
  if (typeof actual !== 'string') {
    return false;
  }
  const actualBytes = Buffer.from(actual, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return (
    actualBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
};

let kakaoRemoteJwks: JWTVerifyGetKey | undefined;

export type KakaoIdTokenVerificationOptions = {
  key?: JWTVerifyGetKey;
  now?: () => Date;
};

export const verifyKakaoIdToken = async (
  idToken: string,
  audience: string,
  expectedNonce?: string,
  options: KakaoIdTokenVerificationOptions = {}
): Promise<KakaoIdentity> => {
  try {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    kakaoRemoteJwks ??= createRemoteJWKSet(KAKAO_JWKS_URL);
    const { payload } = await jwtVerify(
      idToken,
      options.key ?? kakaoRemoteJwks,
      {
        algorithms: ['RS256'],
        issuer: KAKAO_ISSUER,
        audience,
        typ: 'JWT',
        requiredClaims: [
          'sub',
          'iat',
          'exp',
          ...(expectedNonce === undefined ? [] : ['nonce']),
        ],
        clockTolerance: 60,
        maxTokenAge: '1d',
        currentDate: options.now?.(),
      }
    );

    if (
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      payload.sub.length > 255 ||
      (expectedNonce !== undefined && !sameNonce(payload.nonce, expectedNonce))
    ) {
      throw new KakaoLoginRejectedError();
    }
    return { subject: payload.sub };
  } catch (error: unknown) {
    if (error instanceof KakaoLoginRejectedError) {
      throw error;
    }
    throw new KakaoLoginRejectedError();
  }
};

export type AuthenticateWithKakaoOptions = {
  fetch?: Fetch;
  verifyIdToken?: (
    idToken: string,
    audience: string,
    nonce?: string
  ) => Promise<KakaoIdentity>;
};

export const authenticateWithKakao = async (
  config: KakaoAuthConfig,
  input: KakaoAuthenticationInput,
  options: AuthenticateWithKakaoOptions = {}
): Promise<KakaoIdentity> => {
  const verifyIdToken = options.verifyIdToken ?? verifyKakaoIdToken;
  if ('idToken' in input) {
    return verifyIdToken(input.idToken, config.nativeClientId);
  }
  if (!config.rest) {
    throw new KakaoConfigurationError(
      'Kakao REST authentication is not configured.'
    );
  }
  const idToken = await exchangeKakaoAuthorizationCode(
    config.rest,
    input,
    options.fetch
  );
  return verifyIdToken(idToken, config.rest.clientId, input.nonce);
};
