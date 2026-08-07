export const productionConfig = {
  environmentName: 'production',
  region: 'ap-northeast-2',
  stackPrefix: 'LoofitProduction',
  dynamodb: {
    userDataTableName: 'loofit-production-user-data',
    userDataByUserIndexName: 'byUser',
    leaderboardTableName: 'loofit-production-leaderboard',
    leaderboardIndexName: 'byScore',
    leaderboardByUserIndexName: 'byUser',
    maxReadRequestUnits: 1_000,
    maxWriteRequestUnits: 500,
    pointInTimeRecoveryDays: 35,
  },
  api: {
    throttleBurstLimit: 100,
    throttleRateLimit: 50,
    authThrottleBurstLimit: 10,
    authThrottleRateLimit: 5,
  },
  auth: {
    audience: 'loofit-api',
    jwtAlgorithm: 'RS256',
    jwksCacheControlSeconds: 3_600,
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 2_592_000,
    kakaoConfigParameterName: '/loofit/production/auth/kakao',
    appleConfigParameterName: '/loofit/production/auth/apple',
    appleNativeClientId: 'com.loofit.app',
  },
} as const;

export type ProductionConfig = typeof productionConfig;
