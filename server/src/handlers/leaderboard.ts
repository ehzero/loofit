import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyHandlerV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

import {
  LeaderboardAccountInactiveError,
  LeaderboardRepository,
  type WeeklyLeaderboardResponse,
} from '../leaderboard/repository';

type LeaderboardHandlerDependencies = {
  ensureCurrentWeek: (userId: string) => Promise<void>;
  getCurrentWeek: (userId: string) => Promise<WeeklyLeaderboardResponse>;
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

export const createLeaderboardHandler = (
  dependencies: LeaderboardHandlerDependencies
) =>
  async (
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
    requestId: string
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const userId = event.requestContext.authorizer.jwt.claims.sub;
    if (typeof userId !== 'string' || userId.length === 0) {
      return jsonResponse(401, {
        error: { code: 'INVALID_ACCESS_TOKEN', message: 'Invalid Access Token.' },
      });
    }
    try {
      await dependencies.ensureCurrentWeek(userId);
      return jsonResponse(200, await dependencies.getCurrentWeek(userId));
    } catch (error: unknown) {
      if (error instanceof LeaderboardAccountInactiveError) {
        return jsonResponse(401, {
          error: { code: 'ACCOUNT_INACTIVE', message: 'Account is inactive.' },
        });
      }
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
  const repository = new LeaderboardRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    userDataTableName: requireEnvironment('USER_DATA_TABLE_NAME'),
    leaderboardTableName: requireEnvironment('LEADERBOARD_TABLE_NAME'),
    leaderboardScoreIndexName: requireEnvironment(
      'LEADERBOARD_SCORE_INDEX_NAME'
    ),
  });
  return createLeaderboardHandler({
    ensureCurrentWeek: (userId) => repository.ensureCurrentWeek(userId),
    getCurrentWeek: (userId) => repository.getCurrentWeek(userId),
    reportUnexpectedError: (error, requestId) => {
      console.error('Unexpected weekly leaderboard failure.', {
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
