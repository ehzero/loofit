import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyHandlerV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

import { AuthRepository, type AuthAccount } from '../auth/repository';

type MeHandlerDependencies = {
  getAccount: (userId: string) => Promise<AuthAccount | null>;
  reportUnexpectedError?: (error: unknown, requestId: string) => void;
};

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

export const createMeHandler = (dependencies: MeHandlerDependencies) =>
  async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
    requestId: string
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const claims = event.requestContext.authorizer.jwt.claims;
    const userId = claims.sub;
    const sessionId = claims.sid;
    if (typeof userId !== 'string' || typeof sessionId !== 'string') {
      return jsonResponse(401, {
        error: { code: 'INVALID_ACCESS_TOKEN', message: 'Invalid Access Token.' },
      });
    }

    try {
      const account = await dependencies.getAccount(userId);
      if (!account || account.user.status !== 'ACTIVE') {
        return jsonResponse(401, {
          error: { code: 'ACCOUNT_INACTIVE', message: 'Account is inactive.' },
        });
      }
      if (account.identities.length !== 1) {
        throw new Error('Expected exactly one social identity.');
      }
      return jsonResponse(200, {
        user: { id: userId },
        session: { id: sessionId },
        provider: account.identities[0].provider,
      });
    } catch (error: unknown) {
      dependencies.reportUnexpectedError?.(error, requestId);
      return jsonResponse(500, {
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' },
      });
    }
  };

const requireEnvironment = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const buildDefaultHandler = () => {
  const repository = new AuthRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: requireEnvironment('USER_DATA_TABLE_NAME'),
    byUserIndexName: requireEnvironment('USER_DATA_BY_USER_INDEX_NAME'),
  });
  return createMeHandler({
    getAccount: (userId) => repository.getAccount(userId),
    reportUnexpectedError: (error, requestId) => {
      console.error('Unexpected current account failure.', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        requestId,
      });
    },
  });
};

let defaultHandler: ReturnType<typeof buildDefaultHandler> | undefined;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (
  event,
  context
) => {
  defaultHandler ??= buildDefaultHandler();
  return defaultHandler(event, context.awsRequestId);
};
