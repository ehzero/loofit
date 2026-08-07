import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { KMSClient } from '@aws-sdk/client-kms';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

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
  createCachedKakaoConfigLoader,
  KakaoConfigurationError,
} from '../auth/kakao-config';
import {
  authenticateWithKakao,
  KakaoLoginRejectedError,
  KakaoProviderUnavailableError,
  KakaoRedirectUriRejectedError,
  type KakaoAuthenticationInput,
  type KakaoIdentity,
} from '../auth/kakao';
import { AuthRepository } from '../auth/repository';

type KakaoExchangeHandlerDependencies = {
  authenticate: (input: KakaoAuthenticationInput) => Promise<KakaoIdentity>;
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

type KakaoExchangeHandler = (
  event: APIGatewayProxyEventV2,
  requestId: string
) => Promise<APIGatewayProxyStructuredResultV2>;

class InvalidRequestError extends Error {
  constructor() {
    super('Invalid Kakao login request.');
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
): KakaoAuthenticationInput => {
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
  if (!isRecord(parsed)) {
    throw new InvalidRequestError();
  }

  if (parsed.idToken !== undefined) {
    if (
      parsed.code !== undefined ||
      parsed.redirectUri !== undefined ||
      parsed.nonce !== undefined
    ) {
      throw new InvalidRequestError();
    }
    return { idToken: requireBoundedString(parsed.idToken, 16_384) };
  }

  const nonce = requireBoundedString(parsed.nonce, 256);
  if (nonce.length < 16 || !/^[A-Za-z0-9._~-]+$/.test(nonce)) {
    throw new InvalidRequestError();
  }

  return {
    code: requireBoundedString(parsed.code, 4_096),
    redirectUri: requireBoundedString(parsed.redirectUri, 2_048),
    nonce,
  };
};

export const createKakaoExchangeHandler = (
  dependencies: KakaoExchangeHandlerDependencies
): KakaoExchangeHandler =>
  async (event, requestId) => {
    try {
      const request = parseRequest(event);
      const identity = await dependencies.authenticate(request);
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
        user: {
          id: account.userId,
          created: account.created,
        },
      });
    } catch (error: unknown) {
      if (error instanceof InvalidRequestError) {
        return errorResponse(400, 'INVALID_REQUEST', 'Invalid request.');
      }
      if (error instanceof KakaoRedirectUriRejectedError) {
        return errorResponse(
          400,
          'INVALID_REDIRECT_URI',
          'The redirect URI is not allowed.'
        );
      }
      if (error instanceof KakaoLoginRejectedError) {
        return errorResponse(
          401,
          'KAKAO_LOGIN_REJECTED',
          'Kakao login could not be verified.'
        );
      }
      if (
        error instanceof KakaoProviderUnavailableError ||
        error instanceof KakaoConfigurationError
      ) {
        return errorResponse(
          503,
          'AUTH_TEMPORARILY_UNAVAILABLE',
          'Authentication is temporarily unavailable.'
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

const buildDefaultHandler = (): KakaoExchangeHandler => {
  const tableName = requireEnvironment('USER_DATA_TABLE_NAME');
  const byUserIndexName = requireEnvironment('USER_DATA_BY_USER_INDEX_NAME');
  const parameterName = requireEnvironment('KAKAO_CONFIG_PARAMETER_NAME');
  const signingKeyId = requireEnvironment('JWT_SIGNING_KEY_ID');
  const accessTokenTtlSeconds = parsePositiveIntegerEnvironment(
    'ACCESS_TOKEN_TTL_SECONDS'
  );
  const refreshTokenTtlSeconds = parsePositiveIntegerEnvironment(
    'REFRESH_TOKEN_TTL_SECONDS'
  );

  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const repository = new AuthRepository({
    client: documentClient,
    tableName,
    byUserIndexName,
  });
  const ssmClient = new SSMClient({});
  const loadKakaoConfig = createCachedKakaoConfigLoader(async () => {
    try {
      const result = await ssmClient.send(
        new GetParameterCommand({ Name: parameterName, WithDecryption: true })
      );
      return result.Parameter?.Value;
    } catch {
      throw new KakaoConfigurationError(
        'Kakao configuration parameter could not be loaded.'
      );
    }
  });
  const kmsClient = new KMSClient({});
  const issueAccessToken = createAccessTokenIssuer({
    issuer: requireEnvironment('JWT_ISSUER'),
    audience: requireEnvironment('JWT_AUDIENCE'),
    keyId: requireEnvironment('JWT_KEY_ID'),
    ttlSeconds: accessTokenTtlSeconds,
    sign: createKmsRs256Signer(kmsClient, signingKeyId),
  });

  return createKakaoExchangeHandler({
    authenticate: async (input) =>
      authenticateWithKakao(await loadKakaoConfig(), input),
    findOrCreateUser: async (providerSubject) => {
      const result = await repository.findOrCreateUser('KAKAO', providerSubject);
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
      console.error('Unexpected Kakao exchange failure.', {
        errorName,
        requestId,
      });
    },
  });
};

let defaultHandler: KakaoExchangeHandler | undefined;

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  defaultHandler ??= buildDefaultHandler();
  return defaultHandler(event, context.awsRequestId);
};
