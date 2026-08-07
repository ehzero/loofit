import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';

import type { ProductionConfig } from './config';

export type LoofitDataStackProps = StackProps & {
  config: ProductionConfig;
};

export class LoofitDataStack extends Stack {
  readonly leaderboardTable: dynamodb.Table;
  readonly userDataTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: LoofitDataStackProps) {
    super(scope, id, props);

    const { config } = props;

    const commonTableProps = {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      deletionProtection: true,
      encryption: dynamodb.TableEncryption.DEFAULT,
      maxReadRequestUnits: config.dynamodb.maxReadRequestUnits,
      maxWriteRequestUnits: config.dynamodb.maxWriteRequestUnits,
      removalPolicy: RemovalPolicy.RETAIN,
      tableClass: dynamodb.TableClass.STANDARD,
    } as const;

    this.userDataTable = new dynamodb.Table(this, 'UserDataTable', {
      ...commonTableProps,
      tableName: config.dynamodb.userDataTableName,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
        recoveryPeriodInDays: config.dynamodb.pointInTimeRecoveryDays,
      },
      stream: dynamodb.StreamViewType.KEYS_ONLY,
      timeToLiveAttribute: 'expiresAt',
    });
    this.userDataTable.addGlobalSecondaryIndex({
      indexName: config.dynamodb.userDataByUserIndexName,
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
      maxReadRequestUnits: config.dynamodb.maxReadRequestUnits,
      maxWriteRequestUnits: config.dynamodb.maxWriteRequestUnits,
    });

    this.leaderboardTable = new dynamodb.Table(this, 'LeaderboardTable', {
      ...commonTableProps,
      tableName: config.dynamodb.leaderboardTableName,
      partitionKey: { name: 'period', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'expiresAt',
    });
    this.leaderboardTable.addGlobalSecondaryIndex({
      indexName: config.dynamodb.leaderboardIndexName,
      partitionKey: { name: 'period', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'score', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.INCLUDE,
      nonKeyAttributes: [
        'displayName',
        'workoutCount',
        'totalDurationSeconds',
        'updatedAt',
      ],
    });
    this.leaderboardTable.addGlobalSecondaryIndex({
      indexName: config.dynamodb.leaderboardByUserIndexName,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'period', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
      maxReadRequestUnits: config.dynamodb.maxReadRequestUnits,
      maxWriteRequestUnits: config.dynamodb.maxWriteRequestUnits,
    });

    new CfnOutput(this, 'UserDataTableName', {
      value: this.userDataTable.tableName,
      description: 'DynamoDB table for authentication and synchronized user-owned data',
    });
    new CfnOutput(this, 'UserDataTableArn', {
      value: this.userDataTable.tableArn,
    });
    new CfnOutput(this, 'UserDataByUserIndexName', {
      value: config.dynamodb.userDataByUserIndexName,
    });
    new CfnOutput(this, 'LeaderboardTableName', {
      value: this.leaderboardTable.tableName,
      description: 'DynamoDB table for derived leaderboard entries',
    });
    new CfnOutput(this, 'LeaderboardTableArn', {
      value: this.leaderboardTable.tableArn,
    });
    new CfnOutput(this, 'LeaderboardByUserIndexName', {
      value: config.dynamodb.leaderboardByUserIndexName,
    });
  }
}
