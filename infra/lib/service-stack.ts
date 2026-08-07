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
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

import type { ProductionConfig } from './config';

export type LoofitServiceStackProps = StackProps & {
  config: ProductionConfig;
};

export class LoofitServiceStack extends Stack {
  readonly api: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: LoofitServiceStackProps) {
    super(scope, id, props);

    const { config } = props;

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

    this.api.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('HealthIntegration', healthFunction),
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
    defaultStage.node.addDependency(...issuerRoutes);

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
      value: 'self-hosted-jwt-foundation',
      description: 'KMS signing key, public JWKS, and an unattached JWT authorizer',
    });
  }
}
