import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { KMSClient } from '@aws-sdk/client-kms';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

import {
  createAccessTokenIssuer,
  createKmsRs256Signer,
  type AccessTokenIssueResult,
} from '../auth/access-token';
import {
  AuthRepository,
  RefreshTokenRejectedError,
} from '../auth/repository';

type RefreshHandlerDependencies = {
  rotateRefreshToken: (refreshToken: string) => Promise<{
    userId: string;
    sessionId: string;
    refreshToken: string;
    refreshTokenExpiresIn: number;
  }>;
  issueAccessToken: (input: {
    userId: string;
    sessionId: string;
  }) => Promise<AccessTokenIssueResult>;
  reportUnexpectedError?: (error: unknown, requestId: string) => void;
};

type RefreshHandler = (
  event: APIGatewayProxyEventV2,
  requestId: string
) => Promise<APIGatewayProxyStructuredResultV2>;

class InvalidRequestError extends Error {
  constructor() {
    super('Invalid refresh request.');
    this.name = 'InvalidRequestError';
  }
}

const jsonResponse = (
  statusCode: number,
  body: unknown
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  },
  body: JSON.stringify(body),
});

const errorResponse = (
  statusCode: number,
  code: string,
  message: string
): APIGatewayProxyStructuredResultV2 =>
  jsonResponse(statusCode, { error: { code, message } });

const parseRefreshToken = (event: APIGatewayProxyEventV2): string => {
  if (!event.body) {
    throw new InvalidRequestError();
  }
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new InvalidRequestError();
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    typeof (parsed as Record<string, unknown>).refreshToken !== 'string'
  ) {
    throw new InvalidRequestError();
  }
  const refreshToken = (parsed as { refreshToken: string }).refreshToken;
  if (refreshToken.length === 0 || refreshToken.length > 512) {
    throw new InvalidRequestError();
  }
  return refreshToken;
};

export const createRefreshHandler = (
  dependencies: RefreshHandlerDependencies
): RefreshHandler =>
  async (event, requestId) => {
    try {
      const currentRefreshToken = parseRefreshToken(event);
      const session = await dependencies.rotateRefreshToken(
        currentRefreshToken
      );
      const access = await dependencies.issueAccessToken({
        userId: session.userId,
        sessionId: session.sessionId,
      });

      return jsonResponse(200, {
        tokenType: 'Bearer',
        accessToken: access.accessToken,
        expiresIn: access.expiresIn,
        refreshToken: session.refreshToken,
        refreshTokenExpiresIn: session.refreshTokenExpiresIn,
      });
    } catch (error: unknown) {
      if (error instanceof InvalidRequestError) {
        return errorResponse(400, 'INVALID_REQUEST', 'Invalid request.');
      }
      if (error instanceof RefreshTokenRejectedError) {
        return errorResponse(
          401,
          'REFRESH_TOKEN_REJECTED',
          'Refresh Token was rejected.'
        );
      }

      dependencies.reportUnexpectedError?.(error, requestId);
      return errorResponse(500, 'INTERNAL_ERROR', 'Internal server error.');
    }
  };

const requireEnvironment = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const parsePositiveIntegerEnvironment = (name: string): number => {
  const value = Number(requireEnvironment(name));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
};

const buildDefaultHandler = (): RefreshHandler => {
  const refreshTokenTtlSeconds = parsePositiveIntegerEnvironment(
    'REFRESH_TOKEN_TTL_SECONDS'
  );
  const signingKeyId = requireEnvironment('JWT_SIGNING_KEY_ID');
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const repository = new AuthRepository({
    client: documentClient,
    tableName: requireEnvironment('USER_DATA_TABLE_NAME'),
    byUserIndexName: requireEnvironment('USER_DATA_BY_USER_INDEX_NAME'),
  });
  const issueAccessToken = createAccessTokenIssuer({
    issuer: requireEnvironment('JWT_ISSUER'),
    audience: requireEnvironment('JWT_AUDIENCE'),
    keyId: requireEnvironment('JWT_KEY_ID'),
    ttlSeconds: parsePositiveIntegerEnvironment('ACCESS_TOKEN_TTL_SECONDS'),
    sign: createKmsRs256Signer(new KMSClient({}), signingKeyId),
  });

  return createRefreshHandler({
    rotateRefreshToken: async (refreshToken) => {
      const result = await repository.rotateRefreshToken(
        refreshToken,
        refreshTokenTtlSeconds
      );
      return {
        userId: result.session.userId,
        sessionId: result.session.sessionId,
        refreshToken: result.refreshToken,
        refreshTokenExpiresIn: refreshTokenTtlSeconds,
      };
    },
    issueAccessToken,
    reportUnexpectedError: (error, requestId) => {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      console.error('Unexpected refresh failure.', { errorName, requestId });
    },
  });
};

let defaultHandler: RefreshHandler | undefined;

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  defaultHandler ??= buildDefaultHandler();
  return defaultHandler(event, context.awsRequestId);
};
