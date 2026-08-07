import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

import { AuthRepository } from '../auth/repository';

type LogoutHandlerDependencies = {
  revokeSession: (refreshToken: string) => Promise<void>;
  reportUnexpectedError?: (error: unknown, requestId: string) => void;
};

type LogoutHandler = (
  event: APIGatewayProxyEventV2,
  requestId: string
) => Promise<APIGatewayProxyStructuredResultV2>;

class InvalidRequestError extends Error {
  constructor() {
    super('Invalid logout request.');
    this.name = 'InvalidRequestError';
  }
}

const noContentResponse = (): APIGatewayProxyStructuredResultV2 => ({
  statusCode: 204,
  headers: {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
});

const errorResponse = (
  statusCode: number,
  code: string,
  message: string
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  },
  body: JSON.stringify({ error: { code, message } }),
});

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

export const createLogoutHandler = (
  dependencies: LogoutHandlerDependencies
): LogoutHandler =>
  async (event, requestId) => {
    try {
      await dependencies.revokeSession(parseRefreshToken(event));
      return noContentResponse();
    } catch (error: unknown) {
      if (error instanceof InvalidRequestError) {
        return errorResponse(400, 'INVALID_REQUEST', 'Invalid request.');
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

const buildDefaultHandler = (): LogoutHandler => {
  const repository = new AuthRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: requireEnvironment('USER_DATA_TABLE_NAME'),
    byUserIndexName: requireEnvironment('USER_DATA_BY_USER_INDEX_NAME'),
  });

  return createLogoutHandler({
    revokeSession: async (refreshToken) => {
      await repository.revokeSession(refreshToken);
    },
    reportUnexpectedError: (error, requestId) => {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      console.error('Unexpected logout failure.', { errorName, requestId });
    },
  });
};

let defaultHandler: LogoutHandler | undefined;

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  defaultHandler ??= buildDefaultHandler();
  return defaultHandler(event, context.awsRequestId);
};
