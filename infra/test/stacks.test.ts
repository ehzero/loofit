import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

import { productionConfig } from '../lib/config';
import { LoofitDataStack } from '../lib/data-stack';
import { LoofitServiceStack } from '../lib/service-stack';

describe('Loofit production infrastructure', () => {
  it('creates protected on-demand DynamoDB tables for user data and rankings', () => {
    const app = new cdk.App();
    const stack = new LoofitDataStack(app, 'DataTest', {
      config: productionConfig,
      env: { account: '000000000000', region: productionConfig.region },
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::DynamoDB::Table', 2);
    template.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: Match.objectLike({
        BillingMode: 'PAY_PER_REQUEST',
        DeletionProtectionEnabled: true,
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: [
          Match.objectLike({
            IndexName: 'byUser',
            KeySchema: [
              { AttributeName: 'gsi1pk', KeyType: 'HASH' },
              { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          }),
        ],
        OnDemandThroughput: {
          MaxReadRequestUnits: 1000,
          MaxWriteRequestUnits: 500,
        },
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
          RecoveryPeriodInDays: 35,
        },
        TableName: 'loofit-production-user-data',
        TimeToLiveSpecification: {
          AttributeName: 'expiresAt',
          Enabled: true,
        },
      }),
    });
    template.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: Match.objectLike({
        BillingMode: 'PAY_PER_REQUEST',
        DeletionProtectionEnabled: true,
        GlobalSecondaryIndexes: [
          Match.objectLike({
            IndexName: 'byScore',
            KeySchema: [
              { AttributeName: 'period', KeyType: 'HASH' },
              { AttributeName: 'score', KeyType: 'RANGE' },
            ],
          }),
        ],
        TableName: 'loofit-production-leaderboard',
        TimeToLiveSpecification: {
          AttributeName: 'expiresAt',
          Enabled: true,
        },
      }),
    });

    const outputs = template.findOutputs('*');
    expect(Object.keys(outputs)).toEqual(
      expect.arrayContaining([
        'LeaderboardTableArn',
        'LeaderboardTableName',
        'UserDataTableArn',
        'UserDataByUserIndexName',
        'UserDataTableName',
      ])
    );
  });

  it('creates Kakao login with least-privilege KMS signing and JWT protection', () => {
    const app = new cdk.App();
    const dataStack = new LoofitDataStack(app, 'ServiceDataTest', {
      config: productionConfig,
      env: { account: '000000000000', region: productionConfig.region },
    });
    const stack = new LoofitServiceStack(app, 'ServiceTest', {
      config: productionConfig,
      userDataTable: dataStack.userDataTable,
      env: { account: '000000000000', region: productionConfig.region },
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Cognito::UserPool', 0);
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 0);
    template.resourceCountIs('AWS::KMS::Key', 1);
    template.hasResource('AWS::KMS::Key', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: Match.objectLike({
        KeySpec: 'RSA_2048',
        KeyUsage: 'SIGN_VERIFY',
        PendingWindowInDays: 30,
      }),
    });
    template.hasResourceProperties('AWS::KMS::Alias', {
      AliasName: 'alias/loofit-production-auth-signing',
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Architectures: ['arm64'],
      FunctionName: 'loofit-production-health',
      Runtime: 'nodejs22.x',
      TracingConfig: { Mode: 'Active' },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Architectures: ['arm64'],
      FunctionName: 'loofit-production-auth-kakao-exchange',
      Runtime: 'nodejs22.x',
      TracingConfig: { Mode: 'Active' },
      Environment: {
        Variables: Match.objectLike({
          ACCESS_TOKEN_TTL_SECONDS: '900',
          KAKAO_CONFIG_PARAMETER_NAME: '/loofit/production/auth/kakao',
          JWT_AUDIENCE: 'loofit-api',
          REFRESH_TOKEN_TTL_SECONDS: '2592000',
          USER_DATA_BY_USER_INDEX_NAME: 'byUser',
        }),
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Architectures: ['arm64'],
      FunctionName: 'loofit-production-auth-apple-exchange',
      Runtime: 'nodejs22.x',
      TracingConfig: { Mode: 'Active' },
      Environment: {
        Variables: Match.objectLike({
          ACCESS_TOKEN_TTL_SECONDS: '900',
          APPLE_NATIVE_CLIENT_ID: 'com.loofit.app',
          JWT_AUDIENCE: 'loofit-api',
          REFRESH_TOKEN_TTL_SECONDS: '2592000',
          USER_DATA_BY_USER_INDEX_NAME: 'byUser',
        }),
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Architectures: ['arm64'],
      FunctionName: 'loofit-production-me',
      Runtime: 'nodejs22.x',
      TracingConfig: { Mode: 'Active' },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Architectures: ['arm64'],
      FunctionName: 'loofit-production-workout-sync',
      Runtime: 'nodejs22.x',
      TracingConfig: { Mode: 'Active' },
      Environment: {
        Variables: Match.objectLike({
          USER_DATA_TABLE_NAME: Match.anyValue(),
        }),
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Architectures: ['arm64'],
      FunctionName: 'loofit-production-workout-backup',
      Runtime: 'nodejs22.x',
      TracingConfig: { Mode: 'Active' },
      Environment: {
        Variables: Match.objectLike({
          USER_DATA_TABLE_NAME: Match.anyValue(),
        }),
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Architectures: ['arm64'],
      FunctionName: 'loofit-production-auth-refresh',
      Runtime: 'nodejs22.x',
      TracingConfig: { Mode: 'Active' },
      Environment: {
        Variables: Match.objectLike({
          ACCESS_TOKEN_TTL_SECONDS: '900',
          JWT_AUDIENCE: 'loofit-api',
          REFRESH_TOKEN_TTL_SECONDS: '2592000',
          USER_DATA_BY_USER_INDEX_NAME: 'byUser',
        }),
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Architectures: ['arm64'],
      FunctionName: 'loofit-production-auth-logout',
      Runtime: 'nodejs22.x',
      TracingConfig: { Mode: 'Active' },
      Environment: {
        Variables: Match.objectLike({
          USER_DATA_BY_USER_INDEX_NAME: 'byUser',
        }),
      },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Architectures: ['arm64'],
      FunctionName: 'loofit-production-auth-issuer',
      Runtime: 'nodejs22.x',
      TracingConfig: { Mode: 'Active' },
      Environment: {
        Variables: Match.objectLike({
          JWT_ALGORITHM: 'RS256',
          JWKS_CACHE_CONTROL_SECONDS: '3600',
        }),
      },
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'kms:GetPublicKey',
            Effect: 'Allow',
          }),
        ]),
        Version: '2012-10-17',
      },
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'kms:Sign',
            Effect: 'Allow',
          }),
          Match.objectLike({
            Action: 'ssm:GetParameter',
            Effect: 'Allow',
          }),
        ]),
        Version: '2012-10-17',
      },
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /health',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      AuthorizationType: 'NONE',
      RouteKey: 'GET /.well-known/openid-configuration',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      AuthorizationType: 'NONE',
      RouteKey: 'GET /.well-known/jwks.json',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      AuthorizationType: 'NONE',
      RouteKey: 'POST /v1/auth/kakao/exchange',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      AuthorizationType: 'NONE',
      RouteKey: 'POST /v1/auth/apple/exchange',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      AuthorizationType: 'NONE',
      RouteKey: 'POST /v1/auth/refresh',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      AuthorizationType: 'NONE',
      RouteKey: 'POST /v1/auth/logout',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      AuthorizationType: 'JWT',
      AuthorizerId: Match.anyValue(),
      RouteKey: 'GET /v1/me',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      AuthorizationType: 'JWT',
      AuthorizerId: Match.anyValue(),
      RouteKey: 'POST /v1/workouts/sync',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      AuthorizationType: 'JWT',
      AuthorizerId: Match.anyValue(),
      RouteKey: 'GET /v1/workouts/backup',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      AuthorizationType: 'JWT',
      AuthorizerId: Match.anyValue(),
      RouteKey: 'GET /v1/workouts/backup/records',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
      IdentitySource: ['$request.header.Authorization'],
      JwtConfiguration: {
        Audience: ['loofit-api'],
        Issuer: Match.anyValue(),
      },
      Name: 'loofit-production-jwt',
    });
    const authorizer = Object.values(
      template.findResources('AWS::ApiGatewayV2::Authorizer')
    )[0];
    expect(authorizer?.DependsOn).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DefaultStage'),
        expect.stringContaining('wellknownopenidconfiguration'),
        expect.stringContaining('wellknownjwksjson'),
      ])
    );
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      DefaultRouteSettings: {
        DetailedMetricsEnabled: true,
        ThrottlingBurstLimit: 100,
        ThrottlingRateLimit: 50,
      },
      RouteSettings: {
        'POST /v1/auth/apple/exchange': {
          DetailedMetricsEnabled: true,
          ThrottlingBurstLimit: 10,
          ThrottlingRateLimit: 5,
        },
        'POST /v1/auth/kakao/exchange': {
          DetailedMetricsEnabled: true,
          ThrottlingBurstLimit: 10,
          ThrottlingRateLimit: 5,
        },
        'POST /v1/auth/refresh': {
          DetailedMetricsEnabled: true,
          ThrottlingBurstLimit: 10,
          ThrottlingRateLimit: 5,
        },
        'POST /v1/auth/logout': {
          DetailedMetricsEnabled: true,
          ThrottlingBurstLimit: 10,
          ThrottlingRateLimit: 5,
        },
      },
    });
    const defaultStage = Object.values(
      template.findResources('AWS::ApiGatewayV2::Stage')
    )[0];
    expect(defaultStage?.DependsOn).toEqual(
      expect.arrayContaining([
        expect.stringContaining('POSTv1authappleexchange'),
        expect.stringContaining('POSTv1authkakaoexchange'),
        expect.stringContaining('POSTv1authlogout'),
        expect.stringContaining('POSTv1authrefresh'),
      ])
    );

    const outputs = template.findOutputs('*');
    expect(Object.keys(outputs)).toEqual(
      expect.arrayContaining([
        'ApiUrl',
        'AppleExchangeUrl',
        'AuthenticationProvider',
        'HealthUrl',
        'JwksUrl',
        'KakaoConfigParameterName',
        'KakaoExchangeUrl',
        'LogoutUrl',
        'JwtAudience',
        'JwtAuthorizerId',
        'JwtIssuer',
        'MeUrl',
        'RefreshUrl',
        'SigningKeyArn',
        'WorkoutBackupUrl',
        'WorkoutSyncUrl',
      ])
    );
    expect(Object.keys(outputs)).not.toEqual(
      expect.arrayContaining(['UserPoolId', 'UserPoolClientId'])
    );
    const templateJson = JSON.stringify(template.toJSON());
    expect(templateJson).toContain('kms:Sign');
    expect(templateJson).toContain('ssm:GetParameter');
    expect(templateJson).toContain('dynamodb:ConditionCheckItem');
    expect(templateJson).toContain('dynamodb:GetItem');
    expect(templateJson).toContain('dynamodb:PutItem');
    expect(templateJson).toContain('dynamodb:Query');
    expect(templateJson).toContain('dynamodb:TransactWriteItems');
  });
});
