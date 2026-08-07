import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';

import { AUTH_ENTITY_TYPES, userProfileKey } from '../auth/model';

import {
  WORKOUT_SYNC_ENTITY_TYPES,
  createWorkoutRecordItem,
  createWorkoutSyncStateItem,
  createWorkoutTombstoneItem,
  workoutRecordKey,
  workoutSyncStateKey,
  type WorkoutSyncOperation,
  type WorkoutSyncResult,
} from './model';

type DocumentClient = Pick<DynamoDBDocumentClient, 'send'>;

export type WorkoutSyncRepositoryOptions = {
  client: DocumentClient;
  tableName: string;
  now?: () => Date;
};

export class WorkoutSyncDatasetMismatchError extends Error {
  constructor() {
    super('The workout backup belongs to another local dataset.');
    this.name = 'WorkoutSyncDatasetMismatchError';
  }
}

export class WorkoutSyncDataIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkoutSyncDataIntegrityError';
  }
}

export class WorkoutSyncAccountInactiveError extends Error {
  constructor() {
    super('The workout backup account is inactive.');
    this.name = 'WorkoutSyncAccountInactiveError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isConditionalFailure = (error: unknown): boolean =>
  isRecord(error) &&
  (error.name === 'ConditionalCheckFailedException' ||
    error.name === 'TransactionCanceledException');

export class WorkoutSyncRepository {
  private readonly client: DocumentClient;
  private readonly tableName: string;
  private readonly now: () => Date;

  constructor(options: WorkoutSyncRepositoryOptions) {
    this.client = options.client;
    this.tableName = options.tableName;
    this.now = options.now ?? (() => new Date());
  }

  async synchronize(
    userId: string,
    datasetId: string,
    operations: readonly WorkoutSyncOperation[]
  ): Promise<WorkoutSyncResult[]> {
    await this.bindDataset(userId, datasetId);
    const results = await Promise.all(
      operations.map((operation) =>
        this.applyOperation(userId, datasetId, operation)
      )
    );
    await this.touchDataset(userId, datasetId);
    return results;
  }

  private async touchDataset(userId: string, datasetId: string): Promise<void> {
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            this.activeUserCondition(userId),
            {
              Update: {
                TableName: this.tableName,
                Key: workoutSyncStateKey(userId),
                UpdateExpression:
                  'SET updatedAt = :updatedAt ADD backupRevision :revisionIncrement',
                ConditionExpression: 'datasetId = :datasetId',
                ExpressionAttributeValues: {
                  ':updatedAt': this.now().toISOString(),
                  ':revisionIncrement': 1,
                  ':datasetId': datasetId,
                },
              },
            },
          ],
        })
      );
    } catch (error: unknown) {
      if (isConditionalFailure(error)) {
        const state = await this.client.send(
          new GetCommand({
            TableName: this.tableName,
            Key: workoutSyncStateKey(userId),
            ConsistentRead: true,
          })
        );
        if (state.Item) {
          this.assertMatchingDataset(state.Item, datasetId);
        }
        throw new WorkoutSyncAccountInactiveError();
      }
      throw error;
    }
  }

  private async bindDataset(userId: string, datasetId: string): Promise<void> {
    const existing = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: workoutSyncStateKey(userId),
        ConsistentRead: true,
      })
    );
    if (existing.Item) {
      this.assertMatchingDataset(existing.Item, datasetId);
      return;
    }

    try {
      const now = this.now().toISOString();
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            this.activeUserCondition(userId),
            {
              Put: {
                TableName: this.tableName,
                Item: createWorkoutSyncStateItem(userId, datasetId, now),
                ConditionExpression:
                  'attribute_not_exists(pk) AND attribute_not_exists(sk)',
              },
            },
          ],
        })
      );
    } catch (error: unknown) {
      if (!isConditionalFailure(error)) {
        throw error;
      }
      const winner = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: workoutSyncStateKey(userId),
          ConsistentRead: true,
        })
      );
      if (!winner.Item) {
        throw new WorkoutSyncAccountInactiveError();
      }
      this.assertMatchingDataset(winner.Item, datasetId);
    }
  }

  private assertMatchingDataset(item: unknown, datasetId: string): void {
    if (
      !isRecord(item) ||
      item.entityType !== WORKOUT_SYNC_ENTITY_TYPES.state ||
      typeof item.datasetId !== 'string'
    ) {
      throw new WorkoutSyncDataIntegrityError('Invalid workout sync state item.');
    }
    if (item.datasetId !== datasetId) {
      throw new WorkoutSyncDatasetMismatchError();
    }
  }

  private async applyOperation(
    userId: string,
    datasetId: string,
    operation: WorkoutSyncOperation
  ): Promise<WorkoutSyncResult> {
    const now = this.now().toISOString();
    const item =
      operation.type === 'UPSERT'
        ? createWorkoutRecordItem(userId, datasetId, operation, now)
        : createWorkoutTombstoneItem(userId, datasetId, operation, now);

    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            this.activeUserCondition(userId),
            {
              Put: {
                TableName: this.tableName,
                Item: item,
                ConditionExpression:
                  'attribute_not_exists(syncVersion) OR syncVersion < :incomingVersion',
                ExpressionAttributeValues: {
                  ':incomingVersion': operation.version,
                },
              },
            },
          ],
        })
      );
      return {
        syncId: operation.syncId,
        version: operation.version,
        status: 'APPLIED',
      };
    } catch (error: unknown) {
      if (!isConditionalFailure(error)) {
        throw error;
      }
    }

    const existing = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: workoutRecordKey(userId, operation.syncId),
        ConsistentRead: true,
      })
    );
    const serverVersion = existing.Item?.syncVersion;
    if (!Number.isSafeInteger(serverVersion) || serverVersion < operation.version) {
      throw new WorkoutSyncAccountInactiveError();
    }
    return serverVersion === operation.version
      ? {
          syncId: operation.syncId,
          version: operation.version,
          status: 'ALREADY_APPLIED',
        }
      : {
          syncId: operation.syncId,
          version: operation.version,
          status: 'CONFLICT',
          serverVersion,
        };
  }

  private activeUserCondition(userId: string) {
    return {
      ConditionCheck: {
        TableName: this.tableName,
        Key: userProfileKey(userId),
        ConditionExpression:
          'entityType = :userEntityType AND #status = :active',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':userEntityType': AUTH_ENTITY_TYPES.userProfile,
          ':active': 'ACTIVE',
        },
      },
    };
  }
}
