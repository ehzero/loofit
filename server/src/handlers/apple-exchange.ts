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
  AppleLoginRejectedError,
  authenticateWithApple,
  type AppleAuthenticationInput,
  type AppleIdentity,
} from '../auth/apple';
import {
  AccountDeletionInProgressError,
  AuthRepository,
} from '../auth/repository';

type AppleExchangeHandlerDependencies = {
  authenticate: (input: AppleAuthenticationInput) => Promise<AppleIdentity>;
  findOrCreateUser: (
    providerSubject: string
  ) => Promise<{ userId: string; created: boolean }>;
  createSession: (
    userId: string
  ) => Promise<{
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

type AppleExchangeHandler = (
  event: APIGatewayProxyEventV2,
  requestId: string
) => Promise<APIGatewayProxyStructuredResultV2>;

class InvalidRequestError extends Error {
  constructor() {
    super('Invalid Apple login request.');
    this.name = 'InvalidRequestError';
  }
}

const responseHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
} as const;

const jsonResponse = (
  statusCode: number,
  body: unknown
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: responseHeaders,
  body: JSON.stringify(body),
});

const errorResponse = (
  statusCode: number,
  code: string,
  message: string
): APIGatewayProxyStructuredResultV2 =>
  jsonResponse(statusCode, { error: { code, message } });

const requireBoundedString = (
  value: unknown,
  maximumLength: number
): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumLength
  ) {
    throw new InvalidRequestError();
  }
  return value;
};

const parseRequest = (
  event: APIGatewayProxyEventV2
): AppleAuthenticationInput => {
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
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new InvalidRequestError();
  }
  const value = parsed as Record<string, unknown>;
  const nonce = requireBoundedString(value.nonce, 256);
  if (nonce.length < 16 || !/^[A-Za-z0-9._~-]+$/.test(nonce)) {
    throw new InvalidRequestError();
  }
  return {
    idToken: requireBoundedString(value.idToken, 16_384),
    nonce,
  };
};

export const createAppleExchangeHandler = (
  dependencies: AppleExchangeHandlerDependencies
): AppleExchangeHandler =>
  async (event, requestId) => {
    try {
      const identity = await dependencies.authenticate(parseRequest(event));
      const account = await dependencies.findOrCreateUser(identity.subject);
      const session = await dependencies.createSession(account.userId);
      const access = await dependencies.issueAccessToken({
        userId: account.userId,
        sessionId: session.sessionId,
      });

      return jsonResponse(200, {
        tokenType: 'Bearer',
        accessToken: access.accessToken,
        expiresIn: access.expiresIn,
        refreshToken: session.refreshToken,
        refreshTokenExpiresIn: session.refreshTokenExpiresIn,
        user: { id: account.userId, created: account.created },
      });
    } catch (error: unknown) {
      if (error instanceof InvalidRequestError) {
        return errorResponse(400, 'INVALID_REQUEST', 'Invalid request.');
      }
      if (error instanceof AppleLoginRejectedError) {
        return errorResponse(
          401,
          'APPLE_LOGIN_REJECTED',
          'Apple login could not be verified.'
        );
      }
      if (error instanceof AccountDeletionInProgressError) {
        return errorResponse(
          409,
          'ACCOUNT_DELETION_IN_PROGRESS',
          'Account deletion is in progress.'
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

const buildDefaultHandler = (): AppleExchangeHandler => {
  const tableName = requireEnvironment('USER_DATA_TABLE_NAME');
  const byUserIndexName = requireEnvironment('USER_DATA_BY_USER_INDEX_NAME');
  const appleClientId = requireEnvironment('APPLE_NATIVE_CLIENT_ID');
  const signingKeyId = requireEnvironment('JWT_SIGNING_KEY_ID');
  const accessTokenTtlSeconds = parsePositiveIntegerEnvironment(
    'ACCESS_TOKEN_TTL_SECONDS'
  );
  const refreshTokenTtlSeconds = parsePositiveIntegerEnvironment(
    'REFRESH_TOKEN_TTL_SECONDS'
  );
  const repository = new AuthRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName,
    byUserIndexName,
  });
  const issueAccessToken = createAccessTokenIssuer({
    issuer: requireEnvironment('JWT_ISSUER'),
    audience: requireEnvironment('JWT_AUDIENCE'),
    keyId: requireEnvironment('JWT_KEY_ID'),
    ttlSeconds: accessTokenTtlSeconds,
    sign: createKmsRs256Signer(new KMSClient({}), signingKeyId),
  });

  return createAppleExchangeHandler({
    authenticate: (input) => authenticateWithApple(appleClientId, input),
    findOrCreateUser: async (providerSubject) => {
      const result = await repository.findOrCreateUser('APPLE', providerSubject);
      return { userId: result.user.userId, created: result.created };
    },
    createSession: async (userId) => {
      const result = await repository.createSession(
        userId,
        refreshTokenTtlSeconds
      );
      return {
        sessionId: result.session.sessionId,
        refreshToken: result.refreshToken,
        refreshTokenExpiresIn: refreshTokenTtlSeconds,
      };
    },
    issueAccessToken,
    reportUnexpectedError: (error, requestId) => {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      console.error('Unexpected Apple exchange failure.', {
        errorName,
        requestId,
      });
    },
  });
};

let defaultHandler: AppleExchangeHandler | undefined;

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  defaultHandler ??= buildDefaultHandler();
  return defaultHandler(event, context.awsRequestId);
};
