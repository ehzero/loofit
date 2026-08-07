import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import {
  AUTH_ENTITY_TYPES,
  createAuthIdentityItem,
  createAuthSessionItem,
  createAuthUserProfileItem,
  createRefreshSecret,
  createRefreshToken,
  createSessionId,
  createUserId,
  hashRefreshToken,
  identityKey,
  parseRefreshToken,
  sessionKey,
  userPartitionKey,
  userProfileKey,
  type AuthIdentity,
  type AuthIdentityItem,
  type AuthProvider,
  type AuthSession,
  type AuthSessionItem,
  type AuthUser,
  type AuthUserProfileItem,
} from './model';

type DocumentClient = Pick<DynamoDBDocumentClient, 'send'>;

export type AuthRepositoryOptions = {
  client: DocumentClient;
  tableName: string;
  byUserIndexName: string;
  now?: () => Date;
  createUserId?: () => string;
  createSessionId?: () => string;
  createRefreshSecret?: () => string;
};

export type AuthenticatedUser = {
  user: AuthUser;
  identity: AuthIdentity;
};

export type FindOrCreateUserResult = AuthenticatedUser & {
  created: boolean;
};

export type IssuedSession = {
  session: AuthSession;
  refreshToken: string;
};

export class AuthDataIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthDataIntegrityError';
  }
}

export class RefreshTokenRejectedError extends Error {
  constructor() {
    super('Refresh token was rejected.');
    this.name = 'RefreshTokenRejectedError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toUser = (item: unknown): AuthUser => {
  if (
    !isRecord(item) ||
    item.entityType !== AUTH_ENTITY_TYPES.userProfile ||
    typeof item.userId !== 'string' ||
    item.status !== 'ACTIVE' ||
    typeof item.createdAt !== 'string' ||
    typeof item.updatedAt !== 'string'
  ) {
    throw new AuthDataIntegrityError('Invalid auth user profile item.');
  }
  return {
    userId: item.userId,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

const toIdentity = (item: unknown): AuthIdentity => {
  if (
    !isRecord(item) ||
    item.entityType !== AUTH_ENTITY_TYPES.identity ||
    (item.provider !== 'KAKAO' && item.provider !== 'APPLE') ||
    typeof item.subjectHash !== 'string' ||
    typeof item.userId !== 'string' ||
    typeof item.createdAt !== 'string'
  ) {
    throw new AuthDataIntegrityError('Invalid auth identity item.');
  }
  return {
    provider: item.provider,
    subjectHash: item.subjectHash,
    userId: item.userId,
    createdAt: item.createdAt,
  };
};

const toSession = (item: unknown): AuthSession => {
  if (
    !isRecord(item) ||
    item.entityType !== AUTH_ENTITY_TYPES.session ||
    typeof item.userId !== 'string' ||
    typeof item.sessionId !== 'string' ||
    typeof item.rotationCounter !== 'number' ||
    typeof item.createdAt !== 'string' ||
    typeof item.updatedAt !== 'string' ||
    typeof item.lastUsedAt !== 'string' ||
    typeof item.expiresAt !== 'number' ||
    (item.revokedAt !== undefined && typeof item.revokedAt !== 'string')
  ) {
    throw new AuthDataIntegrityError('Invalid auth session item.');
  }
  return {
    userId: item.userId,
    sessionId: item.sessionId,
    rotationCounter: item.rotationCounter,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastUsedAt: item.lastUsedAt,
    expiresAt: item.expiresAt,
    ...(item.revokedAt === undefined ? {} : { revokedAt: item.revokedAt }),
  };
};

const isAwsErrorNamed = (error: unknown, name: string): boolean =>
  isRecord(error) && error.name === name;

const requirePositiveTtl = (ttlSeconds: number): void => {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('Session TTL must be a positive integer.');
  }
};

export class AuthRepository {
  private readonly client: DocumentClient;
  private readonly tableName: string;
  private readonly byUserIndexName: string;
  private readonly now: () => Date;
  private readonly createUserId: () => string;
  private readonly createNewSessionId: () => string;
  private readonly createNewRefreshSecret: () => string;

  constructor(options: AuthRepositoryOptions) {
    this.client = options.client;
    this.tableName = options.tableName;
    this.byUserIndexName = options.byUserIndexName;
    this.now = options.now ?? (() => new Date());
    this.createUserId = options.createUserId ?? createUserId;
    this.createNewSessionId = options.createSessionId ?? createSessionId;
    this.createNewRefreshSecret = options.createRefreshSecret ?? createRefreshSecret;
  }

  async findUserByIdentity(
    provider: AuthProvider,
    providerSubject: string
  ): Promise<AuthenticatedUser | null> {
    const identityResponse = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: identityKey(provider, providerSubject),
        ConsistentRead: true,
      })
    );

    if (!identityResponse.Item) {
      return null;
    }
    const identity = toIdentity(identityResponse.Item);
    const userResponse = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: userProfileKey(identity.userId),
        ConsistentRead: true,
      })
    );
    if (!userResponse.Item) {
      throw new AuthDataIntegrityError('Identity points to a missing user profile.');
    }

    return { user: toUser(userResponse.Item), identity };
  }

  async findOrCreateUser(
    provider: AuthProvider,
    providerSubject: string
  ): Promise<FindOrCreateUserResult> {
    const existing = await this.findUserByIdentity(provider, providerSubject);
    if (existing) {
      return { ...existing, created: false };
    }

    const now = this.now().toISOString();
    const userId = this.createUserId();
    const userItem: AuthUserProfileItem = createAuthUserProfileItem(userId, now);
    const identityItem: AuthIdentityItem = createAuthIdentityItem(
      provider,
      providerSubject,
      userId,
      now
    );

    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: userItem,
                ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: identityItem,
                ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
              },
            },
          ],
        })
      );
    } catch (error: unknown) {
      if (isAwsErrorNamed(error, 'TransactionCanceledException')) {
        const concurrentWinner = await this.findUserByIdentity(provider, providerSubject);
        if (concurrentWinner) {
          return { ...concurrentWinner, created: false };
        }
      }
      throw error;
    }

    return {
      user: toUser(userItem),
      identity: toIdentity(identityItem),
      created: true,
    };
  }

  async createSession(userId: string, ttlSeconds: number): Promise<IssuedSession> {
    requirePositiveTtl(ttlSeconds);
    const nowDate = this.now();
    const now = nowDate.toISOString();
    const sessionId = this.createNewSessionId();
    const refreshToken = createRefreshToken(
      sessionId,
      this.createNewRefreshSecret()
    );
    const sessionItem: AuthSessionItem = createAuthSessionItem({
      userId,
      sessionId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      now,
      expiresAt: Math.floor(nowDate.getTime() / 1_000) + ttlSeconds,
    });

    await this.client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: this.tableName,
              Key: userProfileKey(userId),
              ConditionExpression: 'entityType = :userEntityType AND #status = :active',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':userEntityType': AUTH_ENTITY_TYPES.userProfile,
                ':active': 'ACTIVE',
              },
            },
          },
          {
            Put: {
              TableName: this.tableName,
              Item: sessionItem,
              ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)',
            },
          },
        ],
      })
    );

    return { session: toSession(sessionItem), refreshToken };
  }

  async rotateRefreshToken(
    currentRefreshToken: string,
    ttlSeconds: number
  ): Promise<IssuedSession> {
    requirePositiveTtl(ttlSeconds);
    let sessionId: string;
    try {
      sessionId = parseRefreshToken(currentRefreshToken).sessionId;
    } catch {
      throw new RefreshTokenRejectedError();
    }

    const nowDate = this.now();
    const now = nowDate.toISOString();
    const expiresAt = Math.floor(nowDate.getTime() / 1_000) + ttlSeconds;
    const nextRefreshToken = createRefreshToken(
      sessionId,
      this.createNewRefreshSecret()
    );

    try {
      const response = await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: sessionKey(sessionId),
          UpdateExpression:
            'SET refreshTokenHash = :nextHash, updatedAt = :now, lastUsedAt = :now, expiresAt = :expiresAt ADD rotationCounter :one',
          ConditionExpression:
            'entityType = :sessionEntityType AND refreshTokenHash = :currentHash AND attribute_not_exists(revokedAt) AND expiresAt > :nowEpoch',
          ExpressionAttributeValues: {
            ':nextHash': hashRefreshToken(nextRefreshToken),
            ':currentHash': hashRefreshToken(currentRefreshToken),
            ':now': now,
            ':expiresAt': expiresAt,
            ':nowEpoch': Math.floor(nowDate.getTime() / 1_000),
            ':one': 1,
            ':sessionEntityType': AUTH_ENTITY_TYPES.session,
          },
          ReturnValues: 'ALL_NEW',
        })
      );
      return { session: toSession(response.Attributes), refreshToken: nextRefreshToken };
    } catch (error: unknown) {
      if (isAwsErrorNamed(error, 'ConditionalCheckFailedException')) {
        throw new RefreshTokenRejectedError();
      }
      throw error;
    }
  }

  async revokeSession(refreshToken: string): Promise<boolean> {
    let sessionId: string;
    try {
      sessionId = parseRefreshToken(refreshToken).sessionId;
    } catch {
      return false;
    }

    const nowDate = this.now();
    const now = nowDate.toISOString();
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: sessionKey(sessionId),
          UpdateExpression: 'SET revokedAt = :now, updatedAt = :now',
          ConditionExpression:
            'entityType = :sessionEntityType AND refreshTokenHash = :refreshTokenHash AND attribute_not_exists(revokedAt) AND expiresAt > :nowEpoch',
          ExpressionAttributeValues: {
            ':now': now,
            ':nowEpoch': Math.floor(nowDate.getTime() / 1_000),
            ':refreshTokenHash': hashRefreshToken(refreshToken),
            ':sessionEntityType': AUTH_ENTITY_TYPES.session,
          },
        })
      );
      return true;
    } catch (error: unknown) {
      if (isAwsErrorNamed(error, 'ConditionalCheckFailedException')) {
        return false;
      }
      throw error;
    }
  }

  async listSessions(userId: string): Promise<AuthSession[]> {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: this.byUserIndexName,
        KeyConditionExpression: 'gsi1pk = :userKey AND begins_with(gsi1sk, :sessionPrefix)',
        ExpressionAttributeValues: {
          ':userKey': userPartitionKey(userId),
          ':sessionPrefix': 'SESSION#',
        },
      })
    );
    return (response.Items ?? []).map(toSession);
  }
}
