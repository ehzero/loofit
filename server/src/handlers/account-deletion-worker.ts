import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';

import { AccountDeletionRepository } from '../account-deletion/repository';

type DeletionMessage = { userId: string; requestId: string };

const isDeletionMessage = (value: unknown): value is DeletionMessage =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Record<string, unknown>).userId === 'string' &&
  typeof (value as Record<string, unknown>).requestId === 'string';

const requireEnvironment = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const buildRepository = () =>
  new AccountDeletionRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    userDataTableName: requireEnvironment('USER_DATA_TABLE_NAME'),
    userDataByUserIndexName: requireEnvironment('USER_DATA_BY_USER_INDEX_NAME'),
    leaderboardTableName: requireEnvironment('LEADERBOARD_TABLE_NAME'),
    leaderboardByUserIndexName: requireEnvironment(
      'LEADERBOARD_BY_USER_INDEX_NAME'
    ),
  });

let repository: AccountDeletionRepository | undefined;

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  repository ??= buildRepository();
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];
  for (const record of event.Records) {
    try {
      const message: unknown = JSON.parse(record.body);
      if (!isDeletionMessage(message)) {
        throw new Error('Invalid account deletion message.');
      }
      await repository.purge(message.userId, message.requestId);
    } catch (error: unknown) {
      console.error('Account deletion worker failed.', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        messageId: record.messageId,
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
};
