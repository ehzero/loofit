import { timingSafeEqual } from 'node:crypto';

import type { JWTVerifyGetKey } from 'jose' with { 'resolution-mode': 'import' };

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');

export type AppleAuthenticationInput = {
  idToken: string;
  nonce: string;
};

export type AppleIdentity = {
  subject: string;
};

export class AppleLoginRejectedError extends Error {
  constructor(message = 'Apple login was rejected.') {
    super(message);
    this.name = 'AppleLoginRejectedError';
  }
}

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

let appleRemoteJwks: JWTVerifyGetKey | undefined;

export type AppleIdTokenVerificationOptions = {
  key?: JWTVerifyGetKey;
  now?: () => Date;
};

export const verifyAppleIdToken = async (
  idToken: string,
  audience: string,
  expectedNonce?: string,
  options: AppleIdTokenVerificationOptions = {}
): Promise<AppleIdentity> => {
  try {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    appleRemoteJwks ??= createRemoteJWKSet(APPLE_JWKS_URL);
    const { payload } = await jwtVerify(
      idToken,
      options.key ?? appleRemoteJwks,
      {
        algorithms: ['RS256'],
        issuer: APPLE_ISSUER,
        audience,
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
      throw new AppleLoginRejectedError();
    }
    return { subject: payload.sub };
  } catch (error: unknown) {
    if (error instanceof AppleLoginRejectedError) {
      throw error;
    }
    throw new AppleLoginRejectedError();
  }
};

export const authenticateWithApple = (
  audience: string,
  input: AppleAuthenticationInput,
  options: AppleIdTokenVerificationOptions = {}
): Promise<AppleIdentity> =>
  verifyAppleIdToken(input.idToken, audience, input.nonce, options);
