export const productionConfig = {
  environmentName: 'production',
  region: 'ap-northeast-2',
  stackPrefix: 'LoofitProduction',
  dynamodb: {
    userDataTableName: 'loofit-production-user-data',
    userDataByUserIndexName: 'byUser',
    leaderboardTableName: 'loofit-production-leaderboard',
    leaderboardIndexName: 'byScore',
    maxReadRequestUnits: 1_000,
    maxWriteRequestUnits: 500,
    pointInTimeRecoveryDays: 35,
  },
  api: {
    throttleBurstLimit: 100,
    throttleRateLimit: 50,
  },
  auth: {
    audience: 'loofit-api',
    jwtAlgorithm: 'RS256',
    jwksCacheControlSeconds: 3_600,
  },
} as const;

export type ProductionConfig = typeof productionConfig;
