import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';

import { createWorkoutBackupHandler } from './workout-backup';

const event = (
  rawPath: string,
  cursor?: string,
  userId: string | null = 'user-1'
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    rawPath,
    queryStringParameters: cursor === undefined ? undefined : { cursor },
    requestContext: {
      authorizer: {
        jwt: { claims: userId === null ? {} : { sub: userId }, scopes: [] },
      },
    },
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

const metadata = {
  exists: true as const,
  datasetId: 'a'.repeat(32),
  backupRevision: 4,
  lastBackupAt: '2026-08-07T00:00:00.000Z',
};

describe('GET workout backup API', () => {
  it('returns authenticated backup metadata', async () => {
    const getMetadata = vi.fn(async () => metadata);
    const response = await createWorkoutBackupHandler({
      getMetadata,
      getPage: vi.fn(),
    })(event('/v1/workouts/backup'), 'request-id');

    expect(response.statusCode).toBe(200);
    expect(getMetadata).toHaveBeenCalledWith('user-1');
    expect(JSON.parse(response.body!)).toEqual(metadata);
  });

  it('returns a restore page with an opaque cursor', async () => {
    const nextSyncId = 'b'.repeat(32);
    const response = await createWorkoutBackupHandler({
      getMetadata: vi.fn(async () => metadata),
      getPage: vi.fn(async () => ({
        operations: [
          { type: 'DELETE' as const, syncId: nextSyncId, version: 2 },
        ],
        nextSyncId,
      })),
    })(event('/v1/workouts/backup/records'), 'request-id');

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body!)).toEqual({
      datasetId: metadata.datasetId,
      backupRevision: 4,
      operations: [{ type: 'DELETE', syncId: nextSyncId, version: 2 }],
      nextCursor: Buffer.from(nextSyncId).toString('base64url'),
    });
  });

  it('rejects invalid cursors and missing JWT subjects', async () => {
    const dependencies = {
      getMetadata: vi.fn(async () => metadata),
      getPage: vi.fn(),
    };
    const invalidCursor = await createWorkoutBackupHandler(dependencies)(
      event('/v1/workouts/backup/records', 'invalid'),
      'request-id'
    );
    const unauthorized = await createWorkoutBackupHandler(dependencies)(
      event('/v1/workouts/backup', undefined, null),
      'request-id'
    );

    expect(invalidCursor.statusCode).toBe(400);
    expect(unauthorized.statusCode).toBe(401);
    expect(dependencies.getPage).not.toHaveBeenCalled();
  });
});
