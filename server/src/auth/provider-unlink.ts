import type { AppleAuthConfig } from './apple-config';

const APPLE_AUDIENCE = 'https://appleid.apple.com';
const APPLE_TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_ENDPOINT = 'https://appleid.apple.com/auth/revoke';
const KAKAO_UNLINK_ENDPOINT = 'https://kapi.kakao.com/v1/user/unlink';

type Fetch = typeof fetch;

export class ProviderCredentialRejectedError extends Error {
  constructor() {
    super('Provider credential was rejected.');
    this.name = 'ProviderCredentialRejectedError';
  }
}

export class ProviderTemporarilyUnavailableError extends Error {
  constructor() {
    super('Provider is temporarily unavailable.');
    this.name = 'ProviderTemporarilyUnavailableError';
  }
}

const providerFetch = async (
  input: string,
  init: RequestInit,
  fetchImplementation: Fetch
): Promise<Response> => {
  try {
    return await fetchImplementation(input, {
      ...init,
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new ProviderTemporarilyUnavailableError();
  }
};

export const unlinkKakaoAccount = async (
  accessToken: string,
  expectedSubject: string,
  fetchImplementation: Fetch = fetch
): Promise<void> => {
  const response = await providerFetch(
    KAKAO_UNLINK_ENDPOINT,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}` },
    },
    fetchImplementation
  );
  if (response.status === 429 || response.status >= 500) {
    throw new ProviderTemporarilyUnavailableError();
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (
    !response.ok ||
    typeof body !== 'object' ||
    body === null ||
    String((body as Record<string, unknown>).id) !== expectedSubject
  ) {
    throw new ProviderCredentialRejectedError();
  }
};

export const createAppleClientSecret = async (
  clientId: string,
  config: AppleAuthConfig,
  now: Date = new Date()
): Promise<string> => {
  const { importPKCS8, SignJWT } = await import('jose');
  const key = await importPKCS8(config.privateKey, 'ES256');
  const issuedAt = Math.floor(now.getTime() / 1_000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
    .setIssuer(config.teamId)
    .setSubject(clientId)
    .setAudience(APPLE_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 300)
    .sign(key);
};

type AppleTokenResponse = {
  refresh_token?: unknown;
  id_token?: unknown;
};

export const exchangeAndRevokeAppleAuthorization = async ({
  clientId,
  authorizationCode,
  config,
  verifyExchangedIdToken,
  expectedSubject,
  fetchImplementation = fetch,
}: {
  clientId: string;
  authorizationCode: string;
  config: AppleAuthConfig;
  verifyExchangedIdToken: (idToken: string) => Promise<{ subject: string }>;
  expectedSubject: string;
  fetchImplementation?: Fetch;
}): Promise<void> => {
  const clientSecret = await createAppleClientSecret(clientId, config);
  const tokenResponse = await providerFetch(
    APPLE_TOKEN_ENDPOINT,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: authorizationCode,
        grant_type: 'authorization_code',
      }),
    },
    fetchImplementation
  );
  if (tokenResponse.status === 429 || tokenResponse.status >= 500) {
    throw new ProviderTemporarilyUnavailableError();
  }
  let tokens: AppleTokenResponse;
  try {
    tokens = (await tokenResponse.json()) as AppleTokenResponse;
  } catch {
    tokens = {};
  }
  if (
    !tokenResponse.ok ||
    typeof tokens.refresh_token !== 'string' ||
    typeof tokens.id_token !== 'string'
  ) {
    throw new ProviderCredentialRejectedError();
  }
  const exchangedIdentity = await verifyExchangedIdToken(tokens.id_token);
  if (exchangedIdentity.subject !== expectedSubject) {
    throw new ProviderCredentialRejectedError();
  }

  const revokeResponse = await providerFetch(
    APPLE_REVOKE_ENDPOINT,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        token: tokens.refresh_token,
        token_type_hint: 'refresh_token',
      }),
    },
    fetchImplementation
  );
  if (revokeResponse.status === 429 || revokeResponse.status >= 500) {
    throw new ProviderTemporarilyUnavailableError();
  }
  if (!revokeResponse.ok) {
    throw new ProviderCredentialRejectedError();
  }
};
