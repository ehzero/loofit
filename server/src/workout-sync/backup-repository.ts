import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import {
  WORKOUT_SYNC_ENTITY_TYPES,
  workoutSyncStateKey,
  type WorkoutSyncOperation,
  type WorkoutSyncRecord,
} from './model';
import { WorkoutSyncDataIntegrityError } from './repository';

type DocumentClient = Pick<DynamoDBDocumentClient, 'send'>;

export type WorkoutBackupMetadata =
  | { exists: false }
  | {
      exists: true;
      datasetId: string;
      backupRevision: number;
      lastBackupAt: string;
    };

export type WorkoutBackupPage = {
  operations: WorkoutSyncOperation[];
  nextSyncId: string | null;
};

export type WorkoutBackupRepositoryOptions = {
  client: DocumentClient;
  tableName: string;
};

const DATASET_ID_PATTERN = /^[a-f0-9]{32}$/;
const SYNC_ID_PATTERN = /^[a-f0-9]{32}$/;
const PAGE_SIZE = 100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseBackupRecord = (value: unknown): WorkoutSyncRecord => {
  if (!isRecord(value) || !Array.isArray(value.parts)) {
    throw new WorkoutSyncDataIntegrityError('Invalid stored workout record.');
  }
  return value as WorkoutSyncRecord;
};

export class WorkoutBackupRepository {
  private readonly client: DocumentClient;
  private readonly tableName: string;

  constructor(options: WorkoutBackupRepositoryOptions) {
    this.client = options.client;
    this.tableName = options.tableName;
  }

  async getMetadata(userId: string): Promise<WorkoutBackupMetadata> {
    const response = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: workoutSyncStateKey(userId),
        ConsistentRead: true,
      })
    );
    if (!response.Item) {
      return { exists: false };
    }
    const item = response.Item;
    const backupRevision = item.backupRevision ?? 0;
    if (
      item.entityType !== WORKOUT_SYNC_ENTITY_TYPES.state ||
      typeof item.datasetId !== 'string' ||
      !DATASET_ID_PATTERN.test(item.datasetId) ||
      !Number.isSafeInteger(backupRevision) ||
      backupRevision < 0 ||
      typeof item.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(item.updatedAt))
    ) {
      throw new WorkoutSyncDataIntegrityError(
        'Invalid stored workout backup metadata.'
      );
    }
    return {
      exists: true,
      datasetId: item.datasetId,
      backupRevision,
      lastBackupAt: item.updatedAt,
    };
  }

  async getPage(
    userId: string,
    afterSyncId: string | null
  ): Promise<WorkoutBackupPage> {
    const pk = `USER#${userId}`;
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
          ':pk': pk,
          ':prefix': 'WORKOUT#',
        },
        ExclusiveStartKey: afterSyncId
          ? { pk, sk: `WORKOUT#${afterSyncId}` }
          : undefined,
        Limit: PAGE_SIZE,
        ConsistentRead: true,
      })
    );
    const operations = (response.Items ?? []).map<WorkoutSyncOperation>((item) => {
      if (
        typeof item.syncId !== 'string' ||
        !SYNC_ID_PATTERN.test(item.syncId) ||
        !Number.isSafeInteger(item.syncVersion) ||
        item.syncVersion <= 0
      ) {
        throw new WorkoutSyncDataIntegrityError('Invalid stored workout item.');
      }
      if (item.entityType === WORKOUT_SYNC_ENTITY_TYPES.tombstone) {
        return {
          type: 'DELETE',
          syncId: item.syncId,
          version: item.syncVersion,
        };
      }
      if (item.entityType === WORKOUT_SYNC_ENTITY_TYPES.record) {
        return {
          type: 'UPSERT',
          syncId: item.syncId,
          version: item.syncVersion,
          record: parseBackupRecord(item.record),
        };
      }
      throw new WorkoutSyncDataIntegrityError('Invalid stored workout entity.');
    });

    const nextSk = response.LastEvaluatedKey?.sk;
    const nextSyncId =
      typeof nextSk === 'string' && nextSk.startsWith('WORKOUT#')
        ? nextSk.slice('WORKOUT#'.length)
        : null;
    if (nextSyncId !== null && !SYNC_ID_PATTERN.test(nextSyncId)) {
      throw new WorkoutSyncDataIntegrityError('Invalid workout backup cursor.');
    }
    return { operations, nextSyncId };
  }
}
