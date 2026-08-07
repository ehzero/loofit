import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

const jsonResponse = (
  statusCode: number,
  body: unknown
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  },
  body: JSON.stringify(body),
});

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyStructuredResultV2> => {
  const claims = event.requestContext.authorizer.jwt.claims;
  const userId = claims.sub;
  const sessionId = claims.sid;
  if (typeof userId !== 'string' || typeof sessionId !== 'string') {
    return jsonResponse(401, {
      error: { code: 'INVALID_ACCESS_TOKEN', message: 'Invalid Access Token.' },
    });
  }

  return jsonResponse(200, {
    user: { id: userId },
    session: { id: sessionId },
  });
};
