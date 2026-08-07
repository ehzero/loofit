import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';

import { WorkoutSyncDatasetMismatchError } from '../workout-sync/repository';
import { createWorkoutSyncHandler } from './workout-sync';

const validRequest = {
  datasetId: 'a'.repeat(32),
  operations: [
    {
      type: 'UPSERT',
      syncId: 'b'.repeat(32),
      version: 1,
      record: {
        status: 'completed',
        routineDayNameSnapshot: 'Push',
        startedAt: '2026-08-07T01:00:00.000Z',
        endedAt: '2026-08-07T02:00:00.000Z',
        durationSeconds: 3_600,
        note: null,
        createdAt: '2026-08-07T01:00:00.000Z',
        updatedAt: '2026-08-07T02:00:00.000Z',
        parts: [{ name: '가슴', color: '#E84A5F', sortOrder: 0 }],
      },
    },
  ],
};

const event = (
  body: unknown,
  userId: string | null = 'user-1'
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    body: JSON.stringify(body),
    isBase64Encoded: false,
    requestContext: {
      authorizer: {
        jwt: { claims: userId === null ? {} : { sub: userId }, scopes: [] },
      },
    },
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

describe('POST /v1/workouts/sync', () => {
  it('passes validated operations under the JWT user identity', async () => {
    const synchronize = vi.fn(async () => [
      {
        syncId: 'b'.repeat(32),
        version: 1,
        status: 'APPLIED' as const,
      },
    ]);
    const response = await createWorkoutSyncHandler({ synchronize })(
      event(validRequest),
      'request-id'
    );

    expect(response.statusCode).toBe(200);
    expect(synchronize).toHaveBeenCalledWith(
      'user-1',
      'a'.repeat(32),
      validRequest.operations
    );
    expect(JSON.parse(response.body!)).toEqual({
      results: [
        { syncId: 'b'.repeat(32), version: 1, status: 'APPLIED' },
      ],
    });
  });

  it('rejects malformed records before writing user data', async () => {
    const synchronize = vi.fn();
    const response = await createWorkoutSyncHandler({ synchronize })(
      event({ ...validRequest, datasetId: 'wrong' }),
      'request-id'
    );

    expect(response.statusCode).toBe(400);
    expect(synchronize).not.toHaveBeenCalled();
  });

  it('rejects a different local dataset without exposing stored identifiers', async () => {
    const response = await createWorkoutSyncHandler({
      synchronize: vi.fn(async () => {
        throw new WorkoutSyncDatasetMismatchError();
      }),
    })(event(validRequest), 'request-id');

    expect(response.statusCode).toBe(409);
    expect(response.body).toContain('WORKOUT_SYNC_DATASET_MISMATCH');
    expect(response.body).not.toContain('user-1');
  });

  it('requires a JWT subject before parsing the payload', async () => {
    const synchronize = vi.fn();
    const response = await createWorkoutSyncHandler({ synchronize })(
      event(validRequest, null),
      'request-id'
    );

    expect(response.statusCode).toBe(401);
    expect(synchronize).not.toHaveBeenCalled();
  });
});
