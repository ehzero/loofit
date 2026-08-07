import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

import { userPartitionKey, userProfileKey } from '../auth/model';

type DocumentClient = Pick<DynamoDBDocumentClient, 'send'>;
type Key = Record<string, unknown>;

export type AccountDeletionRepositoryOptions = {
  client: DocumentClient;
  userDataTableName: string;
  userDataByUserIndexName: string;
  leaderboardTableName: string;
  leaderboardByUserIndexName: string;
};

const collectQueryKeys = async (
  client: DocumentClient,
  input: ConstructorParameters<typeof QueryCommand>[0],
  keyFields: readonly string[]
): Promise<Key[]> => {
  const keys: Key[] = [];
  let exclusiveStartKey: Key | undefined;
  do {
    const response = await client.send(
      new QueryCommand({ ...input, ExclusiveStartKey: exclusiveStartKey })
    );
    for (const item of response.Items ?? []) {
      const key = Object.fromEntries(
        keyFields.map((field) => [field, item[field]])
      );
      if (Object.values(key).every((value) => typeof value === 'string')) {
        keys.push(key);
      }
    }
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return keys;
};

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const deleteKeys = async (
  client: DocumentClient,
  tableName: string,
  keys: readonly Key[]
): Promise<void> => {
  for (const batch of chunks(keys, 25)) {
    let requests: Array<{ DeleteRequest: { Key: Key } }> = batch.map(
      (Key) => ({ DeleteRequest: { Key } })
    );
    for (let attempt = 0; requests.length > 0 && attempt < 5; attempt += 1) {
      const response = await client.send(
        new BatchWriteCommand({
          RequestItems: { [tableName]: requests },
        })
      );
      requests = (response.UnprocessedItems?.[tableName] ?? []).flatMap(
        (request) =>
          request.DeleteRequest?.Key
            ? [{ DeleteRequest: { Key: request.DeleteRequest.Key } }]
            : []
      );
    }
    if (requests.length > 0) {
      throw new Error('Account deletion left unprocessed DynamoDB items.');
    }
  }
};

export class AccountDeletionRepository {
  private readonly client: DocumentClient;
  private readonly userDataTableName: string;
  private readonly userDataByUserIndexName: string;
  private readonly leaderboardTableName: string;
  private readonly leaderboardByUserIndexName: string;

  constructor(options: AccountDeletionRepositoryOptions) {
    this.client = options.client;
    this.userDataTableName = options.userDataTableName;
    this.userDataByUserIndexName = options.userDataByUserIndexName;
    this.leaderboardTableName = options.leaderboardTableName;
    this.leaderboardByUserIndexName = options.leaderboardByUserIndexName;
  }

  async purge(userId: string, requestId: string): Promise<void> {
    const userKey = userPartitionKey(userId);
    const profile = userProfileKey(userId);
    const currentProfile = await this.client.send(
      new GetCommand({
        TableName: this.userDataTableName,
        Key: profile,
        ConsistentRead: true,
      })
    );
    if (!currentProfile.Item) {
      return;
    }
    if (
      currentProfile.Item.status !== 'DELETING' ||
      currentProfile.Item.deletionRequestId !== requestId
    ) {
      throw new Error('Account deletion request does not own the user profile.');
    }

    const partitionKeys = await collectQueryKeys(
      this.client,
      {
        TableName: this.userDataTableName,
        KeyConditionExpression: 'pk = :userKey',
        ExpressionAttributeValues: { ':userKey': userKey },
        ConsistentRead: true,
        ProjectionExpression: 'pk, sk',
      },
      ['pk', 'sk']
    );
    await deleteKeys(
      this.client,
      this.userDataTableName,
      partitionKeys.filter(
        (key) => key.pk !== profile.pk || key.sk !== profile.sk
      )
    );

    const ownedKeys = await collectQueryKeys(
      this.client,
      {
        TableName: this.userDataTableName,
        IndexName: this.userDataByUserIndexName,
        KeyConditionExpression: 'gsi1pk = :userKey',
        ExpressionAttributeValues: { ':userKey': userKey },
        ProjectionExpression: 'pk, sk',
      },
      ['pk', 'sk']
    );
    await deleteKeys(this.client, this.userDataTableName, ownedKeys);

    const leaderboardKeys = await collectQueryKeys(
      this.client,
      {
        TableName: this.leaderboardTableName,
        IndexName: this.leaderboardByUserIndexName,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId },
        ProjectionExpression: 'period, userId',
      },
      ['period', 'userId']
    );
    await deleteKeys(this.client, this.leaderboardTableName, leaderboardKeys);

    await this.client.send(
      new DeleteCommand({
        TableName: this.userDataTableName,
        Key: profile,
        ConditionExpression:
          '#status = :deleting AND deletionRequestId = :requestId',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':deleting': 'DELETING',
          ':requestId': requestId,
        },
      })
    );
  }
}
