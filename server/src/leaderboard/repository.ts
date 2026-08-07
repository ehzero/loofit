import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';

import { AUTH_ENTITY_TYPES, userProfileKey } from '../auth/model';
import {
  WORKOUT_SYNC_ENTITY_TYPES,
  workoutSyncStateKey,
} from '../workout-sync/model';

import {
  LEADERBOARD_TIME_ZONE,
  LEADERBOARD_SCORE_DAY_MULTIPLIER,
  MAXIMUM_RANKED_DAY_SECONDS,
  MINIMUM_ACTIVE_DAY_SECONDS,
  createWeeklyLeaderboardMarker,
  createWeeklyLeaderboardItem,
  getWeeklyLeaderboardPeriod,
  type WeeklyLeaderboardItem,
} from './model';

type DocumentClient = Pick<DynamoDBDocumentClient, 'send'>;

export type LeaderboardRepositoryOptions = {
  client: DocumentClient;
  userDataTableName: string;
  leaderboardTableName: string;
  leaderboardScoreIndexName: string;
  now?: () => Date;
};

export type WeeklyLeaderboardEntry = {
  rank: number;
  displayName: string;
  activeDays: number;
  workoutCount: number;
  totalDurationSeconds: number;
  isMe: boolean;
};

export type WeeklyLeaderboardResponse = {
  period: {
    id: string;
    startsAt: string;
    endsAt: string;
    timeZone: typeof LEADERBOARD_TIME_ZONE;
  };
  policy: {
    minimumActiveDaySeconds: number;
    maximumRankedDaySeconds: number;
  };
  entries: WeeklyLeaderboardEntry[];
  me: WeeklyLeaderboardEntry | null;
  generatedAt: string;
};

export class LeaderboardAccountInactiveError extends Error {
  constructor() {
    super('The leaderboard account is inactive.');
    this.name = 'LeaderboardAccountInactiveError';
  }
}

export class LeaderboardDataIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeaderboardDataIntegrityError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isConditionalFailure = (error: unknown): boolean =>
  isRecord(error) &&
  (error.name === 'ConditionalCheckFailedException' ||
    error.name === 'TransactionCanceledException');

type RankedLeaderboardItem = Pick<
  WeeklyLeaderboardItem,
  | 'period'
  | 'userId'
  | 'displayName'
  | 'activeDays'
  | 'workoutCount'
  | 'totalDurationSeconds'
  | 'score'
>;

const parseLeaderboardItem = (value: unknown): RankedLeaderboardItem => {
  if (
    !isRecord(value) ||
    typeof value.period !== 'string' ||
    typeof value.userId !== 'string' ||
    typeof value.displayName !== 'string' ||
    typeof value.workoutCount !== 'number' ||
    !Number.isSafeInteger(value.workoutCount) ||
    typeof value.totalDurationSeconds !== 'number' ||
    !Number.isSafeInteger(value.totalDurationSeconds) ||
    typeof value.score !== 'number' ||
    !Number.isSafeInteger(value.score)
  ) {
    throw new LeaderboardDataIntegrityError('Invalid leaderboard item.');
  }
  const activeDays =
    typeof value.activeDays === 'number' &&
    Number.isSafeInteger(value.activeDays)
      ? value.activeDays
      : Math.floor(value.score / LEADERBOARD_SCORE_DAY_MULTIPLIER);
  if (
    activeDays < 1 ||
    activeDays > 7 ||
    value.score !==
      activeDays * LEADERBOARD_SCORE_DAY_MULTIPLIER +
        value.totalDurationSeconds
  ) {
    throw new LeaderboardDataIntegrityError('Invalid leaderboard score.');
  }
  return {
    period: value.period,
    userId: value.userId,
    displayName: value.displayName,
    activeDays,
    workoutCount: value.workoutCount,
    totalDurationSeconds: value.totalDurationSeconds,
    score: value.score,
  };
};

const toEntry = (
  item: RankedLeaderboardItem,
  rank: number,
  userId: string
): WeeklyLeaderboardEntry => ({
  rank,
  displayName: item.displayName,
  activeDays: item.activeDays,
  workoutCount: item.workoutCount,
  totalDurationSeconds: item.totalDurationSeconds,
  isMe: item.userId === userId,
});

export class LeaderboardRepository {
  private readonly client: DocumentClient;
  private readonly userDataTableName: string;
  private readonly leaderboardTableName: string;
  private readonly leaderboardScoreIndexName: string;
  private readonly now: () => Date;

  constructor(options: LeaderboardRepositoryOptions) {
    this.client = options.client;
    this.userDataTableName = options.userDataTableName;
    this.leaderboardTableName = options.leaderboardTableName;
    this.leaderboardScoreIndexName = options.leaderboardScoreIndexName;
    this.now = options.now ?? (() => new Date());
  }

  async refreshCurrentWeek(userId: string): Promise<void> {
    const now = this.now();
    const period = getWeeklyLeaderboardPeriod(now);
    if (!(await this.isActiveUser(userId))) {
      await this.deleteLeaderboardItem(period.id, userId);
      return;
    }

    const revision = await this.getBackupRevision(userId);
    if (revision === null) {
      await this.deleteLeaderboardItem(period.id, userId);
      return;
    }
    const snapshot = await this.readWorkoutSnapshot(userId, revision);
    const item = createWeeklyLeaderboardItem({
      userId,
      sourceRevision: snapshot.revision,
      items: snapshot.items,
      now,
    });
    const storedItem =
      item ??
      createWeeklyLeaderboardMarker({
        userId,
        sourceRevision: snapshot.revision,
        now,
      });

    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              ConditionCheck: {
                TableName: this.userDataTableName,
                Key: userProfileKey(userId),
                ConditionExpression:
                  'entityType = :userEntityType AND #status = :active',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                  ':userEntityType': AUTH_ENTITY_TYPES.userProfile,
                  ':active': 'ACTIVE',
                },
              },
            },
            {
              Put: {
                TableName: this.leaderboardTableName,
                Item: storedItem,
                ConditionExpression:
                  'attribute_not_exists(sourceRevision) OR sourceRevision <= :sourceRevision',
                ExpressionAttributeValues: {
                  ':sourceRevision': storedItem.sourceRevision,
                },
              },
            },
          ],
        })
      );
    } catch (error: unknown) {
      if (!isConditionalFailure(error)) {
        throw error;
      }
    }
  }

  async ensureCurrentWeek(userId: string): Promise<void> {
    const now = this.now();
    const period = getWeeklyLeaderboardPeriod(now);
    const revision = await this.getBackupRevision(userId);
    if (revision === null) {
      return;
    }
    const current = await this.client.send(
      new GetCommand({
        TableName: this.leaderboardTableName,
        Key: { period: period.id, userId },
        ConsistentRead: true,
      })
    );
    if (current.Item?.sourceRevision === revision) {
      return;
    }
    await this.refreshCurrentWeek(userId);
  }

  async getCurrentWeek(userId: string): Promise<WeeklyLeaderboardResponse> {
    if (!(await this.isActiveUser(userId))) {
      throw new LeaderboardAccountInactiveError();
    }
    const now = this.now();
    const period = getWeeklyLeaderboardPeriod(now);
    const topResponse = await this.client.send(
      new QueryCommand({
        TableName: this.leaderboardTableName,
        IndexName: this.leaderboardScoreIndexName,
        KeyConditionExpression: '#period = :period',
        ExpressionAttributeNames: { '#period': 'period' },
        ExpressionAttributeValues: { ':period': period.id },
        ScanIndexForward: false,
        Limit: 50,
      })
    );
    const topItems = (topResponse.Items ?? []).map(parseLeaderboardItem);
    const entries: WeeklyLeaderboardEntry[] = [];
    let lastScore: number | null = null;
    let currentRank = 0;
    topItems.forEach((item, index) => {
      if (item.score !== lastScore) {
        currentRank = index + 1;
        lastScore = item.score;
      }
      entries.push(toEntry(item, currentRank, userId));
    });

    const topMeIndex = topItems.findIndex((item) => item.userId === userId);
    let me: WeeklyLeaderboardEntry | null =
      topMeIndex >= 0 ? entries[topMeIndex] : null;
    if (!me) {
      const meResponse = await this.client.send(
        new GetCommand({
          TableName: this.leaderboardTableName,
          Key: { period: period.id, userId },
          ConsistentRead: true,
        })
      );
      if (meResponse.Item) {
        if (typeof meResponse.Item.score === 'number') {
          const meItem = parseLeaderboardItem(meResponse.Item);
          const higherScoreCount = await this.countHigherScores(
            period.id,
            meItem.score
          );
          me = toEntry(meItem, higherScoreCount + 1, userId);
        }
      }
    }

    return {
      period,
      policy: {
        minimumActiveDaySeconds: MINIMUM_ACTIVE_DAY_SECONDS,
        maximumRankedDaySeconds: MAXIMUM_RANKED_DAY_SECONDS,
      },
      entries,
      me,
      generatedAt: now.toISOString(),
    };
  }

  private async isActiveUser(userId: string): Promise<boolean> {
    const response = await this.client.send(
      new GetCommand({
        TableName: this.userDataTableName,
        Key: userProfileKey(userId),
        ConsistentRead: true,
      })
    );
    return (
      response.Item?.entityType === AUTH_ENTITY_TYPES.userProfile &&
      response.Item.status === 'ACTIVE'
    );
  }

  private async readWorkoutSnapshot(
    userId: string,
    initialRevision: number
  ): Promise<{ revision: number; items: unknown[] }> {
    let revisionBefore = initialRevision;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const items = await this.getWorkoutItems(userId);
      const revisionAfter = await this.getBackupRevision(userId);
      if (revisionAfter === null) {
        throw new LeaderboardDataIntegrityError(
          'Workout backup disappeared while calculating leaderboard.'
        );
      }
      if (revisionBefore === revisionAfter) {
        return { revision: revisionAfter, items };
      }
      revisionBefore = revisionAfter;
    }
    throw new Error('Workout backup changed while calculating leaderboard.');
  }

  private async getBackupRevision(userId: string): Promise<number | null> {
    const response = await this.client.send(
      new GetCommand({
        TableName: this.userDataTableName,
        Key: workoutSyncStateKey(userId),
        ConsistentRead: true,
      })
    );
    if (!response.Item) {
      return null;
    }
    if (
      response.Item.entityType !== WORKOUT_SYNC_ENTITY_TYPES.state ||
      !Number.isSafeInteger(response.Item.backupRevision) ||
      response.Item.backupRevision < 0
    ) {
      throw new LeaderboardDataIntegrityError(
        'Invalid workout backup revision for leaderboard.'
      );
    }
    return response.Item.backupRevision;
  }

  private async getWorkoutItems(userId: string): Promise<unknown[]> {
    const items: unknown[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const response = await this.client.send(
        new QueryCommand({
          TableName: this.userDataTableName,
          KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
          ExpressionAttributeValues: {
            ':pk': `USER#${userId}`,
            ':prefix': 'WORKOUT#',
          },
          ProjectionExpression: 'entityType, #record',
          ExpressionAttributeNames: { '#record': 'record' },
          ExclusiveStartKey: exclusiveStartKey,
          ConsistentRead: true,
        })
      );
      items.push(...(response.Items ?? []));
      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey);
    return items;
  }

  private async countHigherScores(
    period: string,
    score: number
  ): Promise<number> {
    let count = 0;
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const response = await this.client.send(
        new QueryCommand({
          TableName: this.leaderboardTableName,
          IndexName: this.leaderboardScoreIndexName,
          KeyConditionExpression:
            '#period = :period AND #score > :score',
          ExpressionAttributeNames: {
            '#period': 'period',
            '#score': 'score',
          },
          ExpressionAttributeValues: {
            ':period': period,
            ':score': score,
          },
          Select: 'COUNT',
          ExclusiveStartKey: exclusiveStartKey,
        })
      );
      count += response.Count ?? 0;
      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey);
    return count;
  }

  private async deleteLeaderboardItem(
    period: string,
    userId: string
  ): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.leaderboardTableName,
        Key: { period, userId },
      })
    );
  }
}
