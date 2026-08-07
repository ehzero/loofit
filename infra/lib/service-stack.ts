import * as path from 'node:path';

import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

import type { ProductionConfig } from './config';

export type LoofitServiceStackProps = StackProps & {
  config: ProductionConfig;
  userDataTable: dynamodb.ITable;
  leaderboardTable: dynamodb.ITable;
};

export class LoofitServiceStack extends Stack {
  readonly api: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: LoofitServiceStackProps) {
    super(scope, id, props);

    const { config, userDataTable, leaderboardTable } = props;

    const healthLogGroup = new logs.LogGroup(this, 'HealthLogGroup', {
      logGroupName: `/aws/lambda/loofit-${config.environmentName}-health`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const healthFunction = new lambdaNodejs.NodejsFunction(this, 'HealthFunction', {
      functionName: `loofit-${config.environmentName}-health`,
      description: 'Public health endpoint for the Loofit server foundation',
      entry: path.join(__dirname, '../../server/src/handlers/health.ts'),
      handler: 'handler',
      depsLockFilePath: path.join(__dirname, '../../server/package-lock.json'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(5),
      tracing: lambda.Tracing.ACTIVE,
      logGroup: healthLogGroup,
      environment: {
        APP_ENV: config.environmentName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        target: 'node22',
        format: lambdaNodejs.OutputFormat.CJS,
        minify: true,
        sourceMap: true,
        sourcesContent: false,
      },
    });

    this.api = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `loofit-${config.environmentName}`,
      description: 'Loofit production HTTP API',
      createDefaultStage: false,
      disableExecuteApiEndpoint: false,
    });

    const signingKey = new kms.Key(this, 'AuthSigningKey', {
      alias: `alias/loofit-${config.environmentName}-auth-signing`,
      description: 'Asymmetric signing key for Loofit authentication tokens',
      keySpec: kms.KeySpec.RSA_2048,
      keyUsage: kms.KeyUsage.SIGN_VERIFY,
      pendingWindow: Duration.days(30),
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const accountDeletionDeadLetterQueue = new sqs.Queue(
      this,
      'AccountDeletionDeadLetterQueue',
      {
        queueName: `loofit-${config.environmentName}-account-deletion-dlq`,
        encryption: sqs.QueueEncryption.SQS_MANAGED,
        retentionPeriod: Duration.days(14),
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );
    const accountDeletionQueue = new sqs.Queue(
      this,
      'AccountDeletionQueue',
      {
        queueName: `loofit-${config.environmentName}-account-deletion`,
        encryption: sqs.QueueEncryption.SQS_MANAGED,
        retentionPeriod: Duration.days(1),
        visibilityTimeout: Duration.minutes(2),
        deadLetterQueue: {
          queue: accountDeletionDeadLetterQueue,
          maxReceiveCount: 5,
        },
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );

    const issuerLogGroup = new logs.LogGroup(this, 'IssuerLogGroup', {
      logGroupName: `/aws/lambda/loofit-${config.environmentName}-auth-issuer`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const issuerFunction = new lambdaNodejs.NodejsFunction(this, 'IssuerFunction', {
      functionName: `loofit-${config.environmentName}-auth-issuer`,
      description: 'Publishes Loofit JWT issuer metadata and KMS-backed public keys',
      entry: path.join(__dirname, '../../server/src/handlers/issuer.ts'),
      handler: 'handler',
      depsLockFilePath: path.join(__dirname, '../../server/package-lock.json'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(5),
      tracing: lambda.Tracing.ACTIVE,
      logGroup: issuerLogGroup,
      environment: {
        JWT_ISSUER: this.api.apiEndpoint,
        JWT_SIGNING_KEY_ID: signingKey.keyId,
        JWT_KEY_ID: signingKey.keyId,
        JWT_ALGORITHM: config.auth.jwtAlgorithm,
        JWKS_CACHE_CONTROL_SECONDS: String(config.auth.jwksCacheControlSeconds),
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        target: 'node22',
        format: lambdaNodejs.OutputFormat.CJS,
        minify: true,
        sourceMap: true,
        sourcesContent: false,
        bundleAwsSDK: true,
      },
    });

    signingKey.grant(issuerFunction, 'kms:GetPublicKey');

    const kakaoExchangeLogGroup = new logs.LogGroup(
      this,
      'KakaoExchangeLogGroup',
      {
        logGroupName: `/aws/lambda/loofit-${config.environmentName}-auth-kakao-exchange`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );
    const kakaoExchangeFunction = new lambdaNodejs.NodejsFunction(
      this,
      'KakaoExchangeFunction',
      {
        functionName: `loofit-${config.environmentName}-auth-kakao-exchange`,
        description:
          'Exchanges Kakao authorization codes and issues Loofit user sessions',
        entry: path.join(
          __dirname,
          '../../server/src/handlers/kakao-exchange.ts'
        ),
        handler: 'handler',
        depsLockFilePath: path.join(
          __dirname,
          '../../server/package-lock.json'
        ),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 256,
        timeout: Duration.seconds(10),
        tracing: lambda.Tracing.ACTIVE,
        logGroup: kakaoExchangeLogGroup,
        environment: {
          USER_DATA_TABLE_NAME: userDataTable.tableName,
          USER_DATA_BY_USER_INDEX_NAME:
            config.dynamodb.userDataByUserIndexName,
          KAKAO_CONFIG_PARAMETER_NAME: config.auth.kakaoConfigParameterName,
          JWT_ISSUER: this.api.apiEndpoint,
          JWT_AUDIENCE: config.auth.audience,
          JWT_SIGNING_KEY_ID: signingKey.keyId,
          JWT_KEY_ID: signingKey.keyId,
          ACCESS_TOKEN_TTL_SECONDS: String(
            config.auth.accessTokenTtlSeconds
          ),
          REFRESH_TOKEN_TTL_SECONDS: String(
            config.auth.refreshTokenTtlSeconds
          ),
          NODE_OPTIONS: '--enable-source-maps',
        },
        bundling: {
          target: 'node22',
          format: lambdaNodejs.OutputFormat.CJS,
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          bundleAwsSDK: true,
        },
      }
    );
    kakaoExchangeFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:ConditionCheckItem',
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:Query',
          'dynamodb:TransactWriteItems',
          'dynamodb:UpdateItem',
        ],
        resources: [
          userDataTable.tableArn,
          `${userDataTable.tableArn}/index/*`,
        ],
      })
    );

    const appleExchangeLogGroup = new logs.LogGroup(
      this,
      'AppleExchangeLogGroup',
      {
        logGroupName: `/aws/lambda/loofit-${config.environmentName}-auth-apple-exchange`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );
    const appleExchangeFunction = new lambdaNodejs.NodejsFunction(
      this,
      'AppleExchangeFunction',
      {
        functionName: `loofit-${config.environmentName}-auth-apple-exchange`,
        description: 'Verifies Apple identity tokens and issues Loofit sessions',
        entry: path.join(
          __dirname,
          '../../server/src/handlers/apple-exchange.ts'
        ),
        handler: 'handler',
        depsLockFilePath: path.join(
          __dirname,
          '../../server/package-lock.json'
        ),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 256,
        timeout: Duration.seconds(10),
        tracing: lambda.Tracing.ACTIVE,
        logGroup: appleExchangeLogGroup,
        environment: {
          USER_DATA_TABLE_NAME: userDataTable.tableName,
          USER_DATA_BY_USER_INDEX_NAME:
            config.dynamodb.userDataByUserIndexName,
          APPLE_NATIVE_CLIENT_ID: config.auth.appleNativeClientId,
          JWT_ISSUER: this.api.apiEndpoint,
          JWT_AUDIENCE: config.auth.audience,
          JWT_SIGNING_KEY_ID: signingKey.keyId,
          JWT_KEY_ID: signingKey.keyId,
          ACCESS_TOKEN_TTL_SECONDS: String(
            config.auth.accessTokenTtlSeconds
          ),
          REFRESH_TOKEN_TTL_SECONDS: String(
            config.auth.refreshTokenTtlSeconds
          ),
          NODE_OPTIONS: '--enable-source-maps',
        },
        bundling: {
          target: 'node22',
          format: lambdaNodejs.OutputFormat.CJS,
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          bundleAwsSDK: true,
        },
      }
    );
    appleExchangeFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:ConditionCheckItem',
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:Query',
          'dynamodb:TransactWriteItems',
          'dynamodb:UpdateItem',
        ],
        resources: [
          userDataTable.tableArn,
          `${userDataTable.tableArn}/index/*`,
        ],
      })
    );
    signingKey.grant(appleExchangeFunction, 'kms:Sign');

    const refreshLogGroup = new logs.LogGroup(this, 'RefreshLogGroup', {
      logGroupName: `/aws/lambda/loofit-${config.environmentName}-auth-refresh`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const refreshFunction = new lambdaNodejs.NodejsFunction(
      this,
      'RefreshFunction',
      {
        functionName: `loofit-${config.environmentName}-auth-refresh`,
        description: 'Rotates Loofit refresh tokens and issues access tokens',
        entry: path.join(__dirname, '../../server/src/handlers/refresh.ts'),
        handler: 'handler',
        depsLockFilePath: path.join(
          __dirname,
          '../../server/package-lock.json'
        ),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 256,
        timeout: Duration.seconds(10),
        tracing: lambda.Tracing.ACTIVE,
        logGroup: refreshLogGroup,
        environment: {
          USER_DATA_TABLE_NAME: userDataTable.tableName,
          USER_DATA_BY_USER_INDEX_NAME:
            config.dynamodb.userDataByUserIndexName,
          JWT_ISSUER: this.api.apiEndpoint,
          JWT_AUDIENCE: config.auth.audience,
          JWT_SIGNING_KEY_ID: signingKey.keyId,
          JWT_KEY_ID: signingKey.keyId,
          ACCESS_TOKEN_TTL_SECONDS: String(
            config.auth.accessTokenTtlSeconds
          ),
          REFRESH_TOKEN_TTL_SECONDS: String(
            config.auth.refreshTokenTtlSeconds
          ),
          NODE_OPTIONS: '--enable-source-maps',
        },
        bundling: {
          target: 'node22',
          format: lambdaNodejs.OutputFormat.CJS,
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          bundleAwsSDK: true,
        },
      }
    );
    refreshFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:ConditionCheckItem',
          'dynamodb:GetItem',
          'dynamodb:TransactWriteItems',
          'dynamodb:UpdateItem',
        ],
        resources: [userDataTable.tableArn],
      })
    );
    signingKey.grant(refreshFunction, 'kms:Sign');

    const logoutLogGroup = new logs.LogGroup(this, 'LogoutLogGroup', {
      logGroupName: `/aws/lambda/loofit-${config.environmentName}-auth-logout`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const logoutFunction = new lambdaNodejs.NodejsFunction(
      this,
      'LogoutFunction',
      {
        functionName: `loofit-${config.environmentName}-auth-logout`,
        description: 'Revokes the current Loofit refresh session',
        entry: path.join(__dirname, '../../server/src/handlers/logout.ts'),
        handler: 'handler',
        depsLockFilePath: path.join(
          __dirname,
          '../../server/package-lock.json'
        ),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 128,
        timeout: Duration.seconds(5),
        tracing: lambda.Tracing.ACTIVE,
        logGroup: logoutLogGroup,
        environment: {
          USER_DATA_TABLE_NAME: userDataTable.tableName,
          USER_DATA_BY_USER_INDEX_NAME:
            config.dynamodb.userDataByUserIndexName,
          NODE_OPTIONS: '--enable-source-maps',
        },
        bundling: {
          target: 'node22',
          format: lambdaNodejs.OutputFormat.CJS,
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          bundleAwsSDK: true,
        },
      }
    );
    logoutFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:UpdateItem'],
        resources: [userDataTable.tableArn],
      })
    );

    signingKey.grant(kakaoExchangeFunction, 'kms:Sign');
    kakaoExchangeFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          this.formatArn({
            service: 'ssm',
            resource: 'parameter',
            resourceName: config.auth.kakaoConfigParameterName.replace(/^\//, ''),
          }),
        ],
      })
    );

    const meLogGroup = new logs.LogGroup(this, 'MeLogGroup', {
      logGroupName: `/aws/lambda/loofit-${config.environmentName}-me`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const meFunction = new lambdaNodejs.NodejsFunction(this, 'MeFunction', {
      functionName: `loofit-${config.environmentName}-me`,
      description: 'Returns the current Loofit user and session identifiers',
      entry: path.join(__dirname, '../../server/src/handlers/me.ts'),
      handler: 'handler',
      depsLockFilePath: path.join(__dirname, '../../server/package-lock.json'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 128,
      timeout: Duration.seconds(5),
      tracing: lambda.Tracing.ACTIVE,
      logGroup: meLogGroup,
      environment: {
        USER_DATA_TABLE_NAME: userDataTable.tableName,
        USER_DATA_BY_USER_INDEX_NAME:
          config.dynamodb.userDataByUserIndexName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        target: 'node22',
        format: lambdaNodejs.OutputFormat.CJS,
        minify: true,
        sourceMap: true,
        sourcesContent: false,
        bundleAwsSDK: true,
      },
    });
    meFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:Query'],
        resources: [
          userDataTable.tableArn,
          `${userDataTable.tableArn}/index/*`,
        ],
      })
    );

    const accountDeletionLogGroup = new logs.LogGroup(
      this,
      'AccountDeletionLogGroup',
      {
        logGroupName: `/aws/lambda/loofit-${config.environmentName}-account-deletion`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );
    const accountDeletionFunction = new lambdaNodejs.NodejsFunction(
      this,
      'AccountDeletionFunction',
      {
        functionName: `loofit-${config.environmentName}-account-deletion`,
        description:
          'Reauthenticates social accounts and accepts permanent account deletion',
        entry: path.join(
          __dirname,
          '../../server/src/handlers/account-deletion.ts'
        ),
        handler: 'handler',
        depsLockFilePath: path.join(
          __dirname,
          '../../server/package-lock.json'
        ),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 256,
        timeout: Duration.seconds(20),
        tracing: lambda.Tracing.ACTIVE,
        logGroup: accountDeletionLogGroup,
        environment: {
          USER_DATA_TABLE_NAME: userDataTable.tableName,
          USER_DATA_BY_USER_INDEX_NAME:
            config.dynamodb.userDataByUserIndexName,
          KAKAO_CONFIG_PARAMETER_NAME:
            config.auth.kakaoConfigParameterName,
          APPLE_CONFIG_PARAMETER_NAME:
            config.auth.appleConfigParameterName,
          APPLE_NATIVE_CLIENT_ID: config.auth.appleNativeClientId,
          ACCOUNT_DELETION_QUEUE_URL: accountDeletionQueue.queueUrl,
          NODE_OPTIONS: '--enable-source-maps',
        },
        bundling: {
          target: 'node22',
          format: lambdaNodejs.OutputFormat.CJS,
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          bundleAwsSDK: true,
        },
      }
    );
    accountDeletionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:Query',
          'dynamodb:UpdateItem',
        ],
        resources: [
          userDataTable.tableArn,
          `${userDataTable.tableArn}/index/*`,
        ],
      })
    );
    accountDeletionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          this.formatArn({
            service: 'ssm',
            resource: 'parameter',
            resourceName: config.auth.kakaoConfigParameterName.replace(
              /^\//,
              ''
            ),
          }),
          this.formatArn({
            service: 'ssm',
            resource: 'parameter',
            resourceName: config.auth.appleConfigParameterName.replace(
              /^\//,
              ''
            ),
          }),
        ],
      })
    );
    accountDeletionQueue.grantSendMessages(accountDeletionFunction);

    const accountDeletionWorkerLogGroup = new logs.LogGroup(
      this,
      'AccountDeletionWorkerLogGroup',
      {
        logGroupName: `/aws/lambda/loofit-${config.environmentName}-account-deletion-worker`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );
    const accountDeletionWorkerFunction = new lambdaNodejs.NodejsFunction(
      this,
      'AccountDeletionWorkerFunction',
      {
        functionName: `loofit-${config.environmentName}-account-deletion-worker`,
        description:
          'Permanently removes account-owned authentication, backup, and ranking data',
        entry: path.join(
          __dirname,
          '../../server/src/handlers/account-deletion-worker.ts'
        ),
        handler: 'handler',
        depsLockFilePath: path.join(
          __dirname,
          '../../server/package-lock.json'
        ),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 256,
        timeout: Duration.seconds(60),
        tracing: lambda.Tracing.ACTIVE,
        logGroup: accountDeletionWorkerLogGroup,
        environment: {
          USER_DATA_TABLE_NAME: userDataTable.tableName,
          USER_DATA_BY_USER_INDEX_NAME:
            config.dynamodb.userDataByUserIndexName,
          LEADERBOARD_TABLE_NAME: leaderboardTable.tableName,
          LEADERBOARD_BY_USER_INDEX_NAME:
            config.dynamodb.leaderboardByUserIndexName,
          NODE_OPTIONS: '--enable-source-maps',
        },
        bundling: {
          target: 'node22',
          format: lambdaNodejs.OutputFormat.CJS,
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          bundleAwsSDK: true,
        },
      }
    );
    accountDeletionWorkerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:BatchWriteItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
        ],
        resources: [
          userDataTable.tableArn,
          `${userDataTable.tableArn}/index/*`,
          leaderboardTable.tableArn,
          `${leaderboardTable.tableArn}/index/*`,
        ],
      })
    );
    accountDeletionWorkerFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(accountDeletionQueue, {
        batchSize: 1,
        reportBatchItemFailures: true,
      })
    );

    const workoutSyncLogGroup = new logs.LogGroup(
      this,
      'WorkoutSyncLogGroup',
      {
        logGroupName: `/aws/lambda/loofit-${config.environmentName}-workout-sync`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );
    const workoutSyncFunction = new lambdaNodejs.NodejsFunction(
      this,
      'WorkoutSyncFunction',
      {
        functionName: `loofit-${config.environmentName}-workout-sync`,
        description:
          'Stores the local-first workout history backup for an authenticated user',
        entry: path.join(
          __dirname,
          '../../server/src/handlers/workout-sync.ts'
        ),
        handler: 'handler',
        depsLockFilePath: path.join(
          __dirname,
          '../../server/package-lock.json'
        ),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 256,
        timeout: Duration.seconds(10),
        tracing: lambda.Tracing.ACTIVE,
        logGroup: workoutSyncLogGroup,
        environment: {
          USER_DATA_TABLE_NAME: userDataTable.tableName,
          NODE_OPTIONS: '--enable-source-maps',
        },
        bundling: {
          target: 'node22',
          format: lambdaNodejs.OutputFormat.CJS,
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          bundleAwsSDK: true,
        },
      }
    );
    workoutSyncFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:ConditionCheckItem',
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:TransactWriteItems',
          'dynamodb:UpdateItem',
        ],
        resources: [userDataTable.tableArn],
      })
    );

    const workoutBackupLogGroup = new logs.LogGroup(
      this,
      'WorkoutBackupLogGroup',
      {
        logGroupName: `/aws/lambda/loofit-${config.environmentName}-workout-backup`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );
    const workoutBackupFunction = new lambdaNodejs.NodejsFunction(
      this,
      'WorkoutBackupFunction',
      {
        functionName: `loofit-${config.environmentName}-workout-backup`,
        description:
          'Returns workout backup metadata and paginated restore records',
        entry: path.join(
          __dirname,
          '../../server/src/handlers/workout-backup.ts'
        ),
        handler: 'handler',
        depsLockFilePath: path.join(
          __dirname,
          '../../server/package-lock.json'
        ),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 256,
        timeout: Duration.seconds(10),
        tracing: lambda.Tracing.ACTIVE,
        logGroup: workoutBackupLogGroup,
        environment: {
          USER_DATA_TABLE_NAME: userDataTable.tableName,
          NODE_OPTIONS: '--enable-source-maps',
        },
        bundling: {
          target: 'node22',
          format: lambdaNodejs.OutputFormat.CJS,
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          bundleAwsSDK: true,
        },
      }
    );
    workoutBackupFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:Query'],
        resources: [userDataTable.tableArn],
      })
    );

    const leaderboardWorkerLogGroup = new logs.LogGroup(
      this,
      'LeaderboardWorkerLogGroup',
      {
        logGroupName: `/aws/lambda/loofit-${config.environmentName}-leaderboard-worker`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );
    const leaderboardWorkerFunction = new lambdaNodejs.NodejsFunction(
      this,
      'LeaderboardWorkerFunction',
      {
        functionName: `loofit-${config.environmentName}-leaderboard-worker`,
        description:
          'Recomputes the anonymous weekly leaderboard from workout backup revisions',
        entry: path.join(
          __dirname,
          '../../server/src/handlers/leaderboard-worker.ts'
        ),
        handler: 'handler',
        depsLockFilePath: path.join(
          __dirname,
          '../../server/package-lock.json'
        ),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 256,
        timeout: Duration.seconds(30),
        tracing: lambda.Tracing.ACTIVE,
        logGroup: leaderboardWorkerLogGroup,
        environment: {
          USER_DATA_TABLE_NAME: userDataTable.tableName,
          LEADERBOARD_TABLE_NAME: leaderboardTable.tableName,
          LEADERBOARD_SCORE_INDEX_NAME:
            config.dynamodb.leaderboardIndexName,
          NODE_OPTIONS: '--enable-source-maps',
        },
        bundling: {
          target: 'node22',
          format: lambdaNodejs.OutputFormat.CJS,
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          bundleAwsSDK: true,
        },
      }
    );
    leaderboardWorkerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:ConditionCheckItem',
          'dynamodb:GetItem',
          'dynamodb:Query',
          'dynamodb:TransactWriteItems',
        ],
        resources: [userDataTable.tableArn],
      })
    );
    leaderboardWorkerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:DeleteItem',
          'dynamodb:PutItem',
          'dynamodb:TransactWriteItems',
        ],
        resources: [leaderboardTable.tableArn],
      })
    );
    leaderboardWorkerFunction.addEventSource(
      new lambdaEventSources.DynamoEventSource(userDataTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 100,
        maxBatchingWindow: Duration.seconds(5),
        bisectBatchOnError: true,
        retryAttempts: 3,
      })
    );

    const leaderboardLogGroup = new logs.LogGroup(
      this,
      'LeaderboardLogGroup',
      {
        logGroupName: `/aws/lambda/loofit-${config.environmentName}-leaderboard`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );
    const leaderboardFunction = new lambdaNodejs.NodejsFunction(
      this,
      'LeaderboardFunction',
      {
        functionName: `loofit-${config.environmentName}-leaderboard`,
        description:
          'Returns the authenticated user weekly anonymous leaderboard',
        entry: path.join(
          __dirname,
          '../../server/src/handlers/leaderboard.ts'
        ),
        handler: 'handler',
        depsLockFilePath: path.join(
          __dirname,
          '../../server/package-lock.json'
        ),
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 256,
        timeout: Duration.seconds(10),
        tracing: lambda.Tracing.ACTIVE,
        logGroup: leaderboardLogGroup,
        environment: {
          USER_DATA_TABLE_NAME: userDataTable.tableName,
          LEADERBOARD_TABLE_NAME: leaderboardTable.tableName,
          LEADERBOARD_SCORE_INDEX_NAME:
            config.dynamodb.leaderboardIndexName,
          NODE_OPTIONS: '--enable-source-maps',
        },
        bundling: {
          target: 'node22',
          format: lambdaNodejs.OutputFormat.CJS,
          minify: true,
          sourceMap: true,
          sourcesContent: false,
          bundleAwsSDK: true,
        },
      }
    );
    leaderboardFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:ConditionCheckItem',
          'dynamodb:GetItem',
          'dynamodb:Query',
          'dynamodb:TransactWriteItems',
        ],
        resources: [userDataTable.tableArn],
      })
    );
    leaderboardFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:DeleteItem',
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:Query',
          'dynamodb:TransactWriteItems',
        ],
        resources: [
          leaderboardTable.tableArn,
          `${leaderboardTable.tableArn}/index/*`,
        ],
      })
    );

    this.api.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('HealthIntegration', healthFunction),
    });

    const kakaoExchangeRoutes = this.api.addRoutes({
      path: '/v1/auth/kakao/exchange',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'KakaoExchangeIntegration',
        kakaoExchangeFunction
      ),
    });

    const appleExchangeRoutes = this.api.addRoutes({
      path: '/v1/auth/apple/exchange',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'AppleExchangeIntegration',
        appleExchangeFunction
      ),
    });

    const refreshRoutes = this.api.addRoutes({
      path: '/v1/auth/refresh',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'RefreshIntegration',
        refreshFunction
      ),
    });

    const logoutRoutes = this.api.addRoutes({
      path: '/v1/auth/logout',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'LogoutIntegration',
        logoutFunction
      ),
    });

    const issuerIntegration = new integrations.HttpLambdaIntegration(
      'IssuerIntegration',
      issuerFunction
    );
    const issuerRoutes: apigwv2.HttpRoute[] = [];
    for (const path of [
      '/.well-known/openid-configuration',
      '/.well-known/jwks.json',
    ]) {
      issuerRoutes.push(
        ...this.api.addRoutes({
          path,
          methods: [apigwv2.HttpMethod.GET],
          integration: issuerIntegration,
        })
      );
    }

    const apiAccessLogs = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: `/aws/apigateway/loofit-${config.environmentName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const defaultStage = new apigwv2.CfnStage(this, 'DefaultStage', {
      apiId: this.api.apiId,
      stageName: '$default',
      autoDeploy: true,
      accessLogSettings: {
        destinationArn: apiAccessLogs.logGroupArn,
        format: JSON.stringify({
          requestId: '$context.requestId',
          requestTime: '$context.requestTime',
          httpMethod: '$context.httpMethod',
          routeKey: '$context.routeKey',
          status: '$context.status',
          responseLength: '$context.responseLength',
          integrationError: '$context.integrationErrorMessage',
        }),
      },
      defaultRouteSettings: {
        detailedMetricsEnabled: true,
        throttlingBurstLimit: config.api.throttleBurstLimit,
        throttlingRateLimit: config.api.throttleRateLimit,
      },
    });
    defaultStage.addOverride('Properties.RouteSettings', {
      'POST /v1/auth/kakao/exchange': {
        DetailedMetricsEnabled: true,
        ThrottlingBurstLimit: config.api.authThrottleBurstLimit,
        ThrottlingRateLimit: config.api.authThrottleRateLimit,
      },
      'POST /v1/auth/apple/exchange': {
        DetailedMetricsEnabled: true,
        ThrottlingBurstLimit: config.api.authThrottleBurstLimit,
        ThrottlingRateLimit: config.api.authThrottleRateLimit,
      },
      'POST /v1/auth/refresh': {
        DetailedMetricsEnabled: true,
        ThrottlingBurstLimit: config.api.authThrottleBurstLimit,
        ThrottlingRateLimit: config.api.authThrottleRateLimit,
      },
      'POST /v1/auth/logout': {
        DetailedMetricsEnabled: true,
        ThrottlingBurstLimit: config.api.authThrottleBurstLimit,
        ThrottlingRateLimit: config.api.authThrottleRateLimit,
      },
    });
    defaultStage.node.addDependency(
      ...issuerRoutes,
      ...kakaoExchangeRoutes,
      ...appleExchangeRoutes,
      ...refreshRoutes,
      ...logoutRoutes
    );

    const jwtAuthorizer = new apigwv2.CfnAuthorizer(this, 'JwtAuthorizer', {
      apiId: this.api.apiId,
      name: `loofit-${config.environmentName}-jwt`,
      authorizerType: 'JWT',
      identitySource: ['$request.header.Authorization'],
      jwtConfiguration: {
        audience: [config.auth.audience],
        issuer: this.api.apiEndpoint,
      },
    });
    jwtAuthorizer.node.addDependency(defaultStage, ...issuerRoutes);

    const meRoutes = this.api.addRoutes({
      path: '/v1/me',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'MeIntegration',
        meFunction
      ),
    });
    for (const route of meRoutes) {
      const cfnRoute = route.node.defaultChild;
      if (!(cfnRoute instanceof apigwv2.CfnRoute)) {
        throw new Error('Expected /v1/me to synthesize an HTTP API route.');
      }
      cfnRoute.authorizationType = 'JWT';
      cfnRoute.authorizerId = jwtAuthorizer.ref;
      cfnRoute.addResourceDependency(jwtAuthorizer);
    }

    const accountDeletionRoutes = this.api.addRoutes({
      path: '/v1/account/deletion',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'AccountDeletionIntegration',
        accountDeletionFunction
      ),
    });
    for (const route of accountDeletionRoutes) {
      const cfnRoute = route.node.defaultChild;
      if (!(cfnRoute instanceof apigwv2.CfnRoute)) {
        throw new Error(
          'Expected /v1/account/deletion to synthesize an HTTP API route.'
        );
      }
      cfnRoute.authorizationType = 'JWT';
      cfnRoute.authorizerId = jwtAuthorizer.ref;
      cfnRoute.addResourceDependency(jwtAuthorizer);
    }

    const workoutSyncRoutes = this.api.addRoutes({
      path: '/v1/workouts/sync',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        'WorkoutSyncIntegration',
        workoutSyncFunction
      ),
    });
    for (const route of workoutSyncRoutes) {
      const cfnRoute = route.node.defaultChild;
      if (!(cfnRoute instanceof apigwv2.CfnRoute)) {
        throw new Error(
          'Expected /v1/workouts/sync to synthesize an HTTP API route.'
        );
      }
      cfnRoute.authorizationType = 'JWT';
      cfnRoute.authorizerId = jwtAuthorizer.ref;
      cfnRoute.addResourceDependency(jwtAuthorizer);
    }

    const workoutBackupRoutes: apigwv2.HttpRoute[] = [];
    for (const path of [
      '/v1/workouts/backup',
      '/v1/workouts/backup/records',
    ]) {
      workoutBackupRoutes.push(
        ...this.api.addRoutes({
          path,
          methods: [apigwv2.HttpMethod.GET],
          integration: new integrations.HttpLambdaIntegration(
            `WorkoutBackup${path.endsWith('/records') ? 'Records' : 'Metadata'}Integration`,
            workoutBackupFunction
          ),
        })
      );
    }
    for (const route of workoutBackupRoutes) {
      const cfnRoute = route.node.defaultChild;
      if (!(cfnRoute instanceof apigwv2.CfnRoute)) {
        throw new Error(
          'Expected workout backup GET routes to synthesize HTTP API routes.'
        );
      }
      cfnRoute.authorizationType = 'JWT';
      cfnRoute.authorizerId = jwtAuthorizer.ref;
      cfnRoute.addResourceDependency(jwtAuthorizer);
    }

    const leaderboardRoutes = this.api.addRoutes({
      path: '/v1/leaderboards/weekly',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'LeaderboardIntegration',
        leaderboardFunction
      ),
    });
    for (const route of leaderboardRoutes) {
      const cfnRoute = route.node.defaultChild;
      if (!(cfnRoute instanceof apigwv2.CfnRoute)) {
        throw new Error(
          'Expected /v1/leaderboards/weekly to synthesize an HTTP API route.'
        );
      }
      cfnRoute.authorizationType = 'JWT';
      cfnRoute.authorizerId = jwtAuthorizer.ref;
      cfnRoute.addResourceDependency(jwtAuthorizer);
    }

    new cloudwatch.Alarm(this, 'HealthErrorsAlarm', {
      alarmName: `loofit-${config.environmentName}-health-errors`,
      alarmDescription: 'Health Lambda returned at least one error in five minutes.',
      metric: healthFunction.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'IssuerErrorsAlarm', {
      alarmName: `loofit-${config.environmentName}-auth-issuer-errors`,
      alarmDescription: 'JWT issuer Lambda returned at least one error in five minutes.',
      metric: issuerFunction.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'KakaoExchangeErrorsAlarm', {
      alarmName: `loofit-${config.environmentName}-auth-kakao-exchange-errors`,
      alarmDescription:
        'Kakao exchange Lambda returned at least one unhandled error in five minutes.',
      metric: kakaoExchangeFunction.metricErrors({
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'AppleExchangeErrorsAlarm', {
      alarmName: `loofit-${config.environmentName}-auth-apple-exchange-errors`,
      alarmDescription:
        'Apple exchange Lambda returned at least one unhandled error in five minutes.',
      metric: appleExchangeFunction.metricErrors({
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'RefreshErrorsAlarm', {
      alarmName: `loofit-${config.environmentName}-auth-refresh-errors`,
      alarmDescription:
        'Refresh Lambda returned at least one unhandled error in five minutes.',
      metric: refreshFunction.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'LogoutErrorsAlarm', {
      alarmName: `loofit-${config.environmentName}-auth-logout-errors`,
      alarmDescription:
        'Logout Lambda returned at least one unhandled error in five minutes.',
      metric: logoutFunction.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'AccountDeletionErrorsAlarm', {
      alarmName: `loofit-${config.environmentName}-account-deletion-errors`,
      alarmDescription:
        'Account deletion Lambda returned at least one unhandled error in five minutes.',
      metric: accountDeletionFunction.metricErrors({
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    new cloudwatch.Alarm(this, 'AccountDeletionWorkerErrorsAlarm', {
      alarmName: `loofit-${config.environmentName}-account-deletion-worker-errors`,
      alarmDescription:
        'Account deletion worker returned at least one error in five minutes.',
      metric: accountDeletionWorkerFunction.metricErrors({
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    new cloudwatch.Alarm(this, 'AccountDeletionDeadLettersAlarm', {
      alarmName: `loofit-${config.environmentName}-account-deletion-dead-letters`,
      alarmDescription:
        'At least one account deletion request requires manual recovery.',
      metric: accountDeletionDeadLetterQueue.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'WorkoutSyncErrorsAlarm', {
      alarmName: `loofit-${config.environmentName}-workout-sync-errors`,
      alarmDescription:
        'Workout sync Lambda returned at least one unhandled error in five minutes.',
      metric: workoutSyncFunction.metricErrors({
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'WorkoutBackupErrorsAlarm', {
      alarmName: `loofit-${config.environmentName}-workout-backup-errors`,
      alarmDescription:
        'Workout backup Lambda returned at least one unhandled error in five minutes.',
      metric: workoutBackupFunction.metricErrors({
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'LeaderboardWorkerErrorsAlarm', {
      alarmName: `loofit-${config.environmentName}-leaderboard-worker-errors`,
      alarmDescription:
        'Leaderboard aggregation Lambda returned at least one error in five minutes.',
      metric: leaderboardWorkerFunction.metricErrors({
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    new cloudwatch.Alarm(this, 'LeaderboardErrorsAlarm', {
      alarmName: `loofit-${config.environmentName}-leaderboard-errors`,
      alarmDescription:
        'Leaderboard API Lambda returned at least one error in five minutes.',
      metric: leaderboardFunction.metricErrors({
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'ApiServerErrorsAlarm', {
      alarmName: `loofit-${config.environmentName}-api-5xx`,
      alarmDescription: 'Loofit HTTP API returned at least one 5xx response in five minutes.',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5xx',
        dimensionsMap: {
          ApiId: this.api.apiId,
          Stage: '$default',
        },
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new CfnOutput(this, 'ApiUrl', {
      value: this.api.apiEndpoint,
      description: 'Base URL for the Loofit production HTTP API',
    });
    new CfnOutput(this, 'HealthUrl', {
      value: `${this.api.apiEndpoint}/health`,
    });
    new CfnOutput(this, 'KakaoExchangeUrl', {
      value: `${this.api.apiEndpoint}/v1/auth/kakao/exchange`,
    });
    new CfnOutput(this, 'AppleExchangeUrl', {
      value: `${this.api.apiEndpoint}/v1/auth/apple/exchange`,
    });
    new CfnOutput(this, 'RefreshUrl', {
      value: `${this.api.apiEndpoint}/v1/auth/refresh`,
    });
    new CfnOutput(this, 'LogoutUrl', {
      value: `${this.api.apiEndpoint}/v1/auth/logout`,
    });
    new CfnOutput(this, 'MeUrl', {
      value: `${this.api.apiEndpoint}/v1/me`,
    });
    new CfnOutput(this, 'AccountDeletionUrl', {
      value: `${this.api.apiEndpoint}/v1/account/deletion`,
    });
    new CfnOutput(this, 'WorkoutSyncUrl', {
      value: `${this.api.apiEndpoint}/v1/workouts/sync`,
    });
    new CfnOutput(this, 'WorkoutBackupUrl', {
      value: `${this.api.apiEndpoint}/v1/workouts/backup`,
    });
    new CfnOutput(this, 'WeeklyLeaderboardUrl', {
      value: `${this.api.apiEndpoint}/v1/leaderboards/weekly`,
    });
    new CfnOutput(this, 'KakaoConfigParameterName', {
      value: config.auth.kakaoConfigParameterName,
      description:
        'Existing SecureString parameter read by the Kakao exchange Lambda',
    });
    new CfnOutput(this, 'AppleConfigParameterName', {
      value: config.auth.appleConfigParameterName,
      description:
        'Existing SecureString parameter read when revoking Sign in with Apple',
    });
    new CfnOutput(this, 'JwtIssuer', {
      value: this.api.apiEndpoint,
    });
    new CfnOutput(this, 'JwtAudience', {
      value: config.auth.audience,
    });
    new CfnOutput(this, 'JwksUrl', {
      value: `${this.api.apiEndpoint}/.well-known/jwks.json`,
    });
    new CfnOutput(this, 'JwtAuthorizerId', {
      value: jwtAuthorizer.ref,
    });
    new CfnOutput(this, 'SigningKeyArn', {
      value: signingKey.keyArn,
    });
    new CfnOutput(this, 'AuthenticationProvider', {
      value: 'social-oidc-with-self-hosted-jwt',
      description:
        'Kakao and Apple login with KMS-signed Loofit tokens and a JWT authorizer',
    });
  }
}
