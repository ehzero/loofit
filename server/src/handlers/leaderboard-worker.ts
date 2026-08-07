import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import type { DynamoDBStreamHandler } from 'aws-lambda';

import { LeaderboardRepository } from '../leaderboard/repository';

type LeaderboardWorkerDependencies = {
  refreshCurrentWeek: (userId: string) => Promise<void>;
};

export const createLeaderboardWorker = (
  dependencies: LeaderboardWorkerDependencies
): DynamoDBStreamHandler =>
  async (event) => {
    const userIds = new Set<string>();
    for (const record of event.Records) {
      const pk = record.dynamodb?.Keys?.pk?.S;
      const sk = record.dynamodb?.Keys?.sk?.S;
      if (
        typeof pk === 'string' &&
        pk.startsWith('USER#') &&
        sk === 'BACKUP#WORKOUTS'
      ) {
        userIds.add(pk.slice('USER#'.length));
      }
    }
    await Promise.all(
      [...userIds].map((userId) =>
        dependencies.refreshCurrentWeek(userId)
      )
    );
  };

const requireEnvironment = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const buildDefaultHandler = (): DynamoDBStreamHandler => {
  const repository = new LeaderboardRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    userDataTableName: requireEnvironment('USER_DATA_TABLE_NAME'),
    leaderboardTableName: requireEnvironment('LEADERBOARD_TABLE_NAME'),
    leaderboardScoreIndexName: requireEnvironment(
      'LEADERBOARD_SCORE_INDEX_NAME'
    ),
  });
  return createLeaderboardWorker({
    refreshCurrentWeek: (userId) => repository.refreshCurrentWeek(userId),
  });
};

let defaultHandler: DynamoDBStreamHandler | undefined;

export const handler: DynamoDBStreamHandler = async (event, context, callback) => {
  defaultHandler ??= buildDefaultHandler();
  try {
    return await defaultHandler(event, context, callback);
  } catch (error: unknown) {
    console.error('Unexpected leaderboard aggregation failure.', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      recordCount: event.Records.length,
    });
    throw error;
  }
};
