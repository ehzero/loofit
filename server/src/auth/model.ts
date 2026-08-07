import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const AUTH_PROVIDERS = ['KAKAO', 'APPLE'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const AUTH_ENTITY_TYPES = {
  userProfile: 'AUTH_USER_PROFILE',
  identity: 'AUTH_IDENTITY',
  session: 'AUTH_SESSION',
} as const;

export type AuthUserStatus = 'ACTIVE' | 'DELETING';

export type AuthUserProfileItem = {
  pk: string;
  sk: 'PROFILE';
  entityType: typeof AUTH_ENTITY_TYPES.userProfile;
  userId: string;
  status: AuthUserStatus;
  createdAt: string;
  updatedAt: string;
  deletionRequestId?: string;
  deletionRequestedAt?: string;
};

export type AuthIdentityItem = {
  pk: string;
  sk: 'USER';
  gsi1pk: string;
  gsi1sk: string;
  entityType: typeof AUTH_ENTITY_TYPES.identity;
  provider: AuthProvider;
  subjectHash: string;
  userId: string;
  createdAt: string;
};

export type AuthSessionItem = {
  pk: string;
  sk: 'SESSION';
  gsi1pk: string;
  gsi1sk: string;
  entityType: typeof AUTH_ENTITY_TYPES.session;
  userId: string;
  sessionId: string;
  refreshTokenHash: string;
  rotationCounter: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string;
  expiresAt: number;
  revokedAt?: string;
};

export type AuthUser = Pick<
  AuthUserProfileItem,
  | 'userId'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
  | 'deletionRequestId'
  | 'deletionRequestedAt'
>;

export type AuthIdentity = Pick<
  AuthIdentityItem,
  'provider' | 'subjectHash' | 'userId' | 'createdAt'
>;

export type AuthSession = Pick<
  AuthSessionItem,
  | 'userId'
  | 'sessionId'
  | 'rotationCounter'
  | 'createdAt'
  | 'updatedAt'
  | 'lastUsedAt'
  | 'expiresAt'
  | 'revokedAt'
>;

export const userPartitionKey = (userId: string): string => `USER#${userId}`;

export const userProfileKey = (userId: string) => ({
  pk: userPartitionKey(userId),
  sk: 'PROFILE' as const,
});

export const hashProviderSubject = (
  provider: AuthProvider,
  providerSubject: string
): string => {
  if (!providerSubject.trim()) {
    throw new Error('Provider subject must not be empty.');
  }

  return createHash('sha256')
    .update(provider)
    .update('\0')
    .update(providerSubject)
    .digest('base64url');
};

export const identityKey = (provider: AuthProvider, providerSubject: string) => {
  const subjectHash = hashProviderSubject(provider, providerSubject);
  return {
    pk: `IDENTITY#${provider}#${subjectHash}`,
    sk: 'USER' as const,
  };
};

export const sessionKey = (sessionId: string) => ({
  pk: `SESSION#${sessionId}`,
  sk: 'SESSION' as const,
});

export const createAuthUserProfileItem = (
  userId: string,
  now: string
): AuthUserProfileItem => ({
  ...userProfileKey(userId),
  entityType: AUTH_ENTITY_TYPES.userProfile,
  userId,
  status: 'ACTIVE',
  createdAt: now,
  updatedAt: now,
});

export const createAuthIdentityItem = (
  provider: AuthProvider,
  providerSubject: string,
  userId: string,
  now: string
): AuthIdentityItem => {
  const subjectHash = hashProviderSubject(provider, providerSubject);
  const key = identityKey(provider, providerSubject);
  return {
    pk: key.pk,
    sk: key.sk,
    gsi1pk: userPartitionKey(userId),
    gsi1sk: key.pk,
    entityType: AUTH_ENTITY_TYPES.identity,
    provider,
    subjectHash,
    userId,
    createdAt: now,
  };
};

const REFRESH_TOKEN_PREFIX = 'lrt1';
const REFRESH_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createSessionId = (): string => randomUUID();

export const createUserId = (): string => randomUUID();

export const createRefreshSecret = (): string => randomBytes(32).toString('base64url');

export const createRefreshToken = (sessionId: string, secret: string): string => {
  if (!SESSION_ID_PATTERN.test(sessionId) || !REFRESH_SECRET_PATTERN.test(secret)) {
    throw new Error('Invalid refresh token components.');
  }
  return `${REFRESH_TOKEN_PREFIX}.${sessionId}.${secret}`;
};

export const parseRefreshToken = (token: string): { sessionId: string } => {
  const [prefix, sessionId, secret, extra] = token.split('.');
  if (
    prefix !== REFRESH_TOKEN_PREFIX ||
    !sessionId ||
    !secret ||
    extra !== undefined ||
    !SESSION_ID_PATTERN.test(sessionId) ||
    !REFRESH_SECRET_PATTERN.test(secret)
  ) {
    throw new Error('Invalid refresh token.');
  }
  return { sessionId };
};

export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('base64url');

export const createAuthSessionItem = ({
  userId,
  sessionId,
  refreshTokenHash,
  now,
  expiresAt,
}: {
  userId: string;
  sessionId: string;
  refreshTokenHash: string;
  now: string;
  expiresAt: number;
}): AuthSessionItem => ({
  ...sessionKey(sessionId),
  gsi1pk: userPartitionKey(userId),
  gsi1sk: `SESSION#${sessionId}`,
  entityType: AUTH_ENTITY_TYPES.session,
  userId,
  sessionId,
  refreshTokenHash,
  rotationCounter: 0,
  createdAt: now,
  updatedAt: now,
  lastUsedAt: now,
  expiresAt,
});
