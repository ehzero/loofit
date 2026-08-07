import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => ({
  statusCode: 200,
  headers: {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  },
  body: JSON.stringify({
    service: 'loofit-server',
    status: 'ok',
    environment: process.env.APP_ENV ?? 'unknown',
    requestId: context.awsRequestId,
    path: event.rawPath,
  }),
});
