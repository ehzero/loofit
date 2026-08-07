#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';

import { productionConfig } from '../lib/config';
import { LoofitDataStack } from '../lib/data-stack';
import { LoofitServiceStack } from '../lib/service-stack';

const app = new cdk.App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
if (!account) {
  throw new Error('CDK_DEFAULT_ACCOUNT is required. Run CDK through configured AWS credentials.');
}

const environment = {
  account,
  region: productionConfig.region,
};

const dataStack = new LoofitDataStack(app, `${productionConfig.stackPrefix}Data`, {
  config: productionConfig,
  env: environment,
  description: 'Loofit production serverless persistent data foundation',
  terminationProtection: true,
});

const serviceStack = new LoofitServiceStack(app, `${productionConfig.stackPrefix}Service`, {
  config: productionConfig,
  userDataTable: dataStack.userDataTable,
  env: environment,
  description: 'Loofit production HTTP API, self-hosted JWT, Lambda, and observability foundation',
  terminationProtection: true,
});

serviceStack.addStackDependency(dataStack);

for (const [key, value] of Object.entries({
  Application: 'loofit',
  Environment: productionConfig.environmentName,
  ManagedBy: 'aws-cdk',
  Repository: 'loofit',
})) {
  cdk.Tags.of(app).add(key, value);
}
