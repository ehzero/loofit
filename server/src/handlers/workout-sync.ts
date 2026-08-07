import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyHandlerV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

import type {
  WorkoutSyncOperation,
  WorkoutSyncRecord,
  WorkoutSyncResult,
} from '../workout-sync/model';
import {
  WorkoutSyncDatasetMismatchError,
  WorkoutSyncRepository,
} from '../workout-sync/repository';

type WorkoutSyncHandlerDependencies = {
  synchronize: (
    userId: string,
    datasetId: string,
    operations: readonly WorkoutSyncOperation[]
  ) => Promise<WorkoutSyncResult[]>;
  reportUnexpectedError?: (error: unknown, requestId: string) => void;
};

type WorkoutSyncHandler = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  requestId: string
) => Promise<APIGatewayProxyStructuredResultV2>;

const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_OPERATIONS = 50;
const MAX_NOTE_LENGTH = 10_000;
const MAX_PARTS = 32;

class InvalidRequestError extends Error {
  constructor() {
    super('Invalid workout sync request.');
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

const boundedString = (
  value: unknown,
  maximumLength: number,
  nullable = false,
  allowEmpty = false
): string | null => {
  if (nullable && value === null) {
    return null;
  }
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.length > maximumLength
  ) {
    throw new InvalidRequestError();
  }
  return value;
};

const timestamp = (value: unknown, nullable = false): string | null => {
  const parsed = boundedString(value, 64, nullable);
  if (parsed !== null && !Number.isFinite(Date.parse(parsed))) {
    throw new InvalidRequestError();
  }
  return parsed;
};

const positiveVersion = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || typeof value !== 'number' || value <= 0) {
    throw new InvalidRequestError();
  }
  return value;
};

const parseRecord = (value: unknown): WorkoutSyncRecord => {
  if (!isRecord(value) || !Array.isArray(value.parts)) {
    throw new InvalidRequestError();
  }
  if (value.status !== 'completed' && value.status !== 'canceled') {
    throw new InvalidRequestError();
  }
  if (
    !Number.isSafeInteger(value.durationSeconds) ||
    typeof value.durationSeconds !== 'number' ||
    value.durationSeconds < 0
  ) {
    throw new InvalidRequestError();
  }
  if (value.parts.length === 0 || value.parts.length > MAX_PARTS) {
    throw new InvalidRequestError();
  }

  const parts = value.parts.map((part) => {
    if (
      !isRecord(part) ||
      !Number.isSafeInteger(part.sortOrder) ||
      typeof part.sortOrder !== 'number' ||
      part.sortOrder < 0
    ) {
      throw new InvalidRequestError();
    }
    const color = boundedString(part.color, 32);
    if (!/^#[0-9A-Fa-f]{6}$/.test(color!)) {
      throw new InvalidRequestError();
    }
    return {
      name: boundedString(part.name, 100)!,
      color: color!,
      sortOrder: part.sortOrder,
    };
  });

  return {
    status: value.status,
    routineDayNameSnapshot: boundedString(
      value.routineDayNameSnapshot,
      200,
      true,
      true
    ),
    startedAt: timestamp(value.startedAt)!,
    endedAt: timestamp(value.endedAt, true),
    durationSeconds: value.durationSeconds,
    note: boundedString(value.note, MAX_NOTE_LENGTH, true, true),
    createdAt: timestamp(value.createdAt)!,
    updatedAt: timestamp(value.updatedAt)!,
    parts,
  };
};

const parseRequest = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): { datasetId: string; operations: WorkoutSyncOperation[] } => {
  if (!event.body) {
    throw new InvalidRequestError();
  }
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BYTES) {
    throw new InvalidRequestError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new InvalidRequestError();
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.operations)) {
    throw new InvalidRequestError();
  }
  const datasetId = boundedString(parsed.datasetId, 64)!;
  if (!/^[a-f0-9]{32}$/.test(datasetId)) {
    throw new InvalidRequestError();
  }
  if (
    parsed.operations.length === 0 ||
    parsed.operations.length > MAX_OPERATIONS
  ) {
    throw new InvalidRequestError();
  }

  const seen = new Set<string>();
  const operations = parsed.operations.map<WorkoutSyncOperation>((operation) => {
    if (!isRecord(operation)) {
      throw new InvalidRequestError();
    }
    const syncId = boundedString(operation.syncId, 64)!;
    if (!/^[a-f0-9]{32}$/.test(syncId) || seen.has(syncId)) {
      throw new InvalidRequestError();
    }
    seen.add(syncId);
    const version = positiveVersion(operation.version);
    if (operation.type === 'DELETE') {
      return { type: 'DELETE', syncId, version };
    }
    if (operation.type !== 'UPSERT') {
      throw new InvalidRequestError();
    }
    return {
      type: 'UPSERT',
      syncId,
      version,
      record: parseRecord(operation.record),
    };
  });
  return { datasetId, operations };
};

export const createWorkoutSyncHandler = (
  dependencies: WorkoutSyncHandlerDependencies
): WorkoutSyncHandler =>
  async (event, requestId) => {
    const userId = event.requestContext.authorizer.jwt.claims.sub;
    if (typeof userId !== 'string' || userId.length === 0) {
      return errorResponse(401, 'INVALID_ACCESS_TOKEN', 'Invalid Access Token.');
    }

    try {
      const request = parseRequest(event);
      const results = await dependencies.synchronize(
        userId,
        request.datasetId,
        request.operations
      );
      return jsonResponse(200, { results });
    } catch (error: unknown) {
      if (error instanceof InvalidRequestError) {
        return errorResponse(400, 'INVALID_REQUEST', 'Invalid request.');
      }
      if (error instanceof WorkoutSyncDatasetMismatchError) {
        return errorResponse(
          409,
          'WORKOUT_SYNC_DATASET_MISMATCH',
          'Workout backup belongs to another local dataset.'
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

const buildDefaultHandler = (): WorkoutSyncHandler => {
  const repository = new WorkoutSyncRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: requireEnvironment('USER_DATA_TABLE_NAME'),
  });
  return createWorkoutSyncHandler({
    synchronize: (userId, datasetId, operations) =>
      repository.synchronize(userId, datasetId, operations),
    reportUnexpectedError: (error, requestId) => {
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      console.error('Unexpected workout sync failure.', {
        errorName,
        requestId,
      });
    },
  });
};

let defaultHandler: WorkoutSyncHandler | undefined;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (
  event,
  context
) => {
  defaultHandler ??= buildDefaultHandler();
  return defaultHandler(event, context.awsRequestId);
};
