import { randomUUID } from 'node:crypto';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyHandlerV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

import {
  AppleConfigurationError,
  createCachedAppleConfigLoader,
  type AppleAuthConfig,
} from '../auth/apple-config';
import {
  AppleLoginRejectedError,
  authenticateWithApple,
  verifyAppleIdToken,
} from '../auth/apple';
import {
  AccountDeletionInProgressError,
  AuthRepository,
  type AuthAccount,
} from '../auth/repository';
import {
  createCachedKakaoConfigLoader,
  KakaoConfigurationError,
  type KakaoAuthConfig,
} from '../auth/kakao-config';
import {
  authenticateWithKakao,
  KakaoLoginRejectedError,
} from '../auth/kakao';
import { hashProviderSubject } from '../auth/model';
import {
  exchangeAndRevokeAppleAuthorization,
  ProviderCredentialRejectedError,
  ProviderTemporarilyUnavailableError,
  unlinkKakaoAccount,
} from '../auth/provider-unlink';

type KakaoDeletionProof = {
  provider: 'KAKAO';
  idToken: string;
  accessToken: string;
};

type AppleDeletionProof = {
  provider: 'APPLE';
  idToken: string;
  nonce: string;
  authorizationCode: string;
};

type DeletionProof = KakaoDeletionProof | AppleDeletionProof;

type AccountDeletionHandlerDependencies = {
  getAccount: (userId: string) => Promise<AuthAccount | null>;
  beginDeletion: (userId: string, requestId: string) => Promise<void>;
  rollbackDeletion: (userId: string, requestId: string) => Promise<void>;
  verifyAndUnlink: (
    proof: DeletionProof,
    expectedSubjectHash: string
  ) => Promise<void>;
  enqueue: (userId: string, requestId: string) => Promise<void>;
  createRequestId?: () => string;
  reportUnexpectedError?: (error: unknown, requestId: string) => void;
};

class InvalidRequestError extends Error {
  constructor() {
    super('Invalid account deletion request.');
    this.name = 'InvalidRequestError';
  }
}

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

const errorResponse = (statusCode: number, code: string, message: string) =>
  jsonResponse(statusCode, { error: { code, message } });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const boundedString = (value: unknown, maximum: number): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw new InvalidRequestError();
  }
  return value;
};

const parseRequest = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): DeletionProof => {
  if (!event.body) {
    throw new InvalidRequestError();
  }
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    throw new InvalidRequestError();
  }
  if (!isRecord(value)) {
    throw new InvalidRequestError();
  }
  if (value.provider === 'KAKAO') {
    return {
      provider: 'KAKAO',
      idToken: boundedString(value.idToken, 16_384),
      accessToken: boundedString(value.accessToken, 4_096),
    };
  }
  if (value.provider === 'APPLE') {
    const nonce = boundedString(value.nonce, 256);
    if (nonce.length < 16 || !/^[A-Za-z0-9._~-]+$/.test(nonce)) {
      throw new InvalidRequestError();
    }
    return {
      provider: 'APPLE',
      idToken: boundedString(value.idToken, 16_384),
      nonce,
      authorizationCode: boundedString(value.authorizationCode, 4_096),
    };
  }
  throw new InvalidRequestError();
};

export const createAccountDeletionHandler = (
  dependencies: AccountDeletionHandlerDependencies
) => async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  requestId: string
): Promise<APIGatewayProxyStructuredResultV2> => {
  const userId = event.requestContext.authorizer.jwt.claims.sub;
  if (typeof userId !== 'string' || !userId) {
    return errorResponse(401, 'INVALID_ACCESS_TOKEN', 'Invalid Access Token.');
  }

  let proof: DeletionProof;
  try {
    proof = parseRequest(event);
  } catch (error: unknown) {
    if (error instanceof InvalidRequestError) {
      return errorResponse(400, 'INVALID_REQUEST', 'Invalid request.');
    }
    throw error;
  }

  const deletionRequestId = dependencies.createRequestId?.() ?? randomUUID();
  let deletionStarted = false;
  try {
    const account = await dependencies.getAccount(userId);
    if (!account || account.user.status === 'DELETING') {
      return jsonResponse(202, { status: 'PROCESSING' });
    }
    if (
      account.identities.length !== 1 ||
      account.identities[0].provider !== proof.provider
    ) {
      throw new ProviderCredentialRejectedError();
    }

    await dependencies.beginDeletion(userId, deletionRequestId);
    deletionStarted = true;
    await dependencies.verifyAndUnlink(
      proof,
      account.identities[0].subjectHash
    );
    await dependencies.enqueue(userId, deletionRequestId);
    return jsonResponse(202, { status: 'PROCESSING' });
  } catch (error: unknown) {
    if (deletionStarted) {
      try {
        await dependencies.rollbackDeletion(userId, deletionRequestId);
      } catch (rollbackError: unknown) {
        dependencies.reportUnexpectedError?.(rollbackError, requestId);
      }
    }
    if (error instanceof AccountDeletionInProgressError) {
      return jsonResponse(202, { status: 'PROCESSING' });
    }
    if (error instanceof ProviderCredentialRejectedError) {
      return errorResponse(
        401,
        'ACCOUNT_REAUTHENTICATION_REJECTED',
        'Account reauthentication was rejected.'
      );
    }
    if (
      error instanceof ProviderTemporarilyUnavailableError ||
      error instanceof AppleConfigurationError ||
      error instanceof KakaoConfigurationError
    ) {
      return errorResponse(
        503,
        'AUTH_PROVIDER_UNAVAILABLE',
        'Authentication provider is temporarily unavailable.'
      );
    }
    dependencies.reportUnexpectedError?.(error, requestId);
    return errorResponse(500, 'INTERNAL_ERROR', 'Internal server error.');
  }
};

const requireEnvironment = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const buildDefaultHandler = () => {
  const ssm = new SSMClient({});
  const loadKakaoConfig = createCachedKakaoConfigLoader(async () =>
    (
      await ssm.send(
        new GetParameterCommand({
          Name: requireEnvironment('KAKAO_CONFIG_PARAMETER_NAME'),
          WithDecryption: true,
        })
      )
    ).Parameter?.Value
  );
  const loadAppleConfig = createCachedAppleConfigLoader(async () =>
    (
      await ssm.send(
        new GetParameterCommand({
          Name: requireEnvironment('APPLE_CONFIG_PARAMETER_NAME'),
          WithDecryption: true,
        })
      )
    ).Parameter?.Value
  );
  const appleClientId = requireEnvironment('APPLE_NATIVE_CLIENT_ID');
  const repository = new AuthRepository({
    client: DynamoDBDocumentClient.from(new DynamoDBClient({})),
    tableName: requireEnvironment('USER_DATA_TABLE_NAME'),
    byUserIndexName: requireEnvironment('USER_DATA_BY_USER_INDEX_NAME'),
  });
  const sqs = new SQSClient({});
  const queueUrl = requireEnvironment('ACCOUNT_DELETION_QUEUE_URL');

  const verifyAndUnlink = async (
    proof: DeletionProof,
    expectedSubjectHash: string
  ) => {
    try {
      if (proof.provider === 'KAKAO') {
        const config: KakaoAuthConfig = await loadKakaoConfig();
        const identity = await authenticateWithKakao(config, {
          idToken: proof.idToken,
        });
        if (
          hashProviderSubject('KAKAO', identity.subject) !== expectedSubjectHash
        ) {
          throw new ProviderCredentialRejectedError();
        }
        await unlinkKakaoAccount(proof.accessToken, identity.subject);
        return;
      }

      const identity = await authenticateWithApple(appleClientId, {
        idToken: proof.idToken,
        nonce: proof.nonce,
      });
      if (
        hashProviderSubject('APPLE', identity.subject) !== expectedSubjectHash
      ) {
        throw new ProviderCredentialRejectedError();
      }
      const config: AppleAuthConfig = await loadAppleConfig();
      await exchangeAndRevokeAppleAuthorization({
        clientId: appleClientId,
        authorizationCode: proof.authorizationCode,
        config,
        expectedSubject: identity.subject,
        verifyExchangedIdToken: (idToken) =>
          verifyAppleIdToken(idToken, appleClientId),
      });
    } catch (error: unknown) {
      if (
        error instanceof KakaoLoginRejectedError ||
        error instanceof AppleLoginRejectedError
      ) {
        throw new ProviderCredentialRejectedError();
      }
      throw error;
    }
  };

  return createAccountDeletionHandler({
    getAccount: (userId) => repository.getAccount(userId),
    beginDeletion: (userId, requestId) =>
      repository.beginAccountDeletion(userId, requestId),
    rollbackDeletion: (userId, requestId) =>
      repository.rollbackAccountDeletion(userId, requestId),
    verifyAndUnlink,
    enqueue: async (userId, requestId) => {
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify({ userId, requestId }),
        })
      );
    },
    reportUnexpectedError: (error, requestId) => {
      console.error('Unexpected account deletion failure.', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        requestId,
      });
    },
  });
};

let defaultHandler: ReturnType<typeof buildDefaultHandler> | undefined;

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (
  event,
  context
) => {
  defaultHandler ??= buildDefaultHandler();
  return defaultHandler(event, context.awsRequestId);
};
