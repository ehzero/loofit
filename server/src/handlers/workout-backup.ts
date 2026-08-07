import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyHandlerV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

import {
  WorkoutBackupRepository,
  type WorkoutBackupMetadata,
  type WorkoutBackupPage,
} from '../workout-sync/backup-repository';

type WorkoutBackupHandlerDependencies = {
  getMetadata: (userId: string) => Promise<WorkoutBackupMetadata>;
  getPage: (
    userId: string,
    afterSyncId: string | null
  ) => Promise<WorkoutBackupPage>;
  reportUnexpectedError?: (error: unknown, requestId: string) => void;
};

type WorkoutBackupHandler = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  requestId: string
) => Promise<APIGatewayProxyStructuredResultV2>;

const METADATA_PATH = '/v1/workouts/backup';
const RECORDS_PATH = '/v1/workouts/backup/records';
const SYNC_ID_PATTERN = /^[a-f0-9]{32}$/;

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

const errorResponse = (statusCode: number, code: string, message: string) =>
  jsonResponse(statusCode, { error: { code, message } });

const encodeCursor = (syncId: string): string =>
  Buffer.from(syncId, 'utf8').toString('base64url');

const decodeCursor = (cursor: string | undefined): string | null => {
  if (cursor === undefined) {
    return null;
  }
  if (cursor.length === 0 || cursor.length > 128) {
    throw new Error('INVALID_CURSOR');
  }
  let syncId: string;
  try {
    syncId = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new Error('INVALID_CURSOR');
  }
  if (!SYNC_ID_PATTERN.test(syncId) || encodeCursor(syncId) !== cursor) {
    throw new Error('INVALID_CURSOR');
  }
  return syncId;
};

export const createWorkoutBackupHandler = (
  dependencies: WorkoutBackupHandlerDependencies
): WorkoutBackupHandler =>
  async (event, requestId) => {
    const userId = event.requestContext.authorizer.jwt.claims.sub;
    if (typeof userId !== 'string' || userId.length === 0) {
      return errorResponse(401, 'INVALID_ACCESS_TOKEN', 'Invalid Access Token.');
    }

    try {
      if (event.rawPath === METADATA_PATH) {
        return jsonResponse(200, await dependencies.getMetadata(userId));
      }
      if (event.rawPath === RECORDS_PATH) {
        let afterSyncId: string | null;
        try {
          afterSyncId = decodeCursor(event.queryStringParameters?.cursor);
        } catch {
          return errorResponse(400, 'INVALID_CURSOR', 'Invalid cursor.');
        }
        const metadata = await dependencies.getMetadata(userId);
        if (!metadata.exists) {
          return errorResponse(404, 'BACKUP_NOT_FOUND', 'Workout backup not found.');
        }
        const page = await dependencies.getPage(userId, afterSyncId);
        return jsonResponse(200, {
          datasetId: metadata.datasetId,
          backupRevision: metadata.backupRevision,
          operations: page.operations,
          nextCursor: page.nextSyncId ? encodeCursor(page.nextSyncId) : null,
        });
      }
      return errorResponse(404, 'NOT_FOUND', 'Not found.');
    } catch (error: unknown) {
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

const buildDefaultHandler = (): WorkoutBackupHandler => {
  const repository = new WorkoutBackupRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: requireEnvironment('USER_DATA_TABLE_NAME'),
  });
  return createWorkoutBackupHandler({
    getMetadata: (userId) => repository.getMetadata(userId),
    getPage: (userId, afterSyncId) => repository.getPage(userId, afterSyncId),
    reportUnexpectedError: (error, requestId) => {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      console.error('Unexpected workout backup failure.', {
        errorName,
        requestId,
      });
    },
  });
};

let defaultHandler: WorkoutBackupHandler | undefined;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (
  event,
  context
) => {
  defaultHandler ??= buildDefaultHandler();
  return defaultHandler(event, context.awsRequestId);
};
