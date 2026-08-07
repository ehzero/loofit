import { SignCommand, type KMSClient } from '@aws-sdk/client-kms';
import { randomUUID } from 'node:crypto';

const JWT_ALGORITHM = 'RS256';
const KMS_SIGNING_ALGORITHM = 'RSASSA_PKCS1_V1_5_SHA_256';

export type AccessTokenIssueResult = {
  accessToken: string;
  expiresIn: number;
};

export type AccessTokenIssuerOptions = {
  issuer: string;
  audience: string;
  keyId: string;
  ttlSeconds: number;
  sign: (message: Uint8Array) => Promise<Uint8Array>;
  now?: () => Date;
  createTokenId?: () => string;
};

export type AccessTokenSubject = {
  userId: string;
  sessionId: string;
};

const encodeJson = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const requireNonEmpty = (name: string, value: string): string => {
  if (!value.trim()) {
    throw new Error(`${name} must not be empty.`);
  }
  return value;
};

const normalizeIssuer = (value: string): string => {
  const issuer = new URL(value);
  if (issuer.protocol !== 'https:') {
    throw new Error('Access Token issuer must use HTTPS.');
  }
  return issuer.toString().replace(/\/$/, '');
};

const requirePositiveInteger = (name: string, value: number): number => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
};

export const createAccessTokenIssuer = (options: AccessTokenIssuerOptions) => {
  const issuer = normalizeIssuer(options.issuer);
  const audience = requireNonEmpty('Access Token audience', options.audience);
  const keyId = requireNonEmpty('Access Token key ID', options.keyId);
  const ttlSeconds = requirePositiveInteger(
    'Access Token TTL seconds',
    options.ttlSeconds
  );
  const now = options.now ?? (() => new Date());
  const createTokenId = options.createTokenId ?? randomUUID;

  return async ({
    userId,
    sessionId,
  }: AccessTokenSubject): Promise<AccessTokenIssueResult> => {
    requireNonEmpty('Access Token user ID', userId);
    requireNonEmpty('Access Token session ID', sessionId);

    const issuedAt = Math.floor(now().getTime() / 1_000);
    const header = encodeJson({
      alg: JWT_ALGORITHM,
      typ: 'JWT',
      kid: keyId,
    });
    const payload = encodeJson({
      sub: userId,
      sid: sessionId,
      iss: issuer,
      aud: audience,
      iat: issuedAt,
      exp: issuedAt + ttlSeconds,
      jti: createTokenId(),
    });
    const signingInput = `${header}.${payload}`;
    const signature = await options.sign(Buffer.from(signingInput, 'ascii'));
    if (signature.byteLength === 0) {
      throw new Error('Access Token signing returned an empty signature.');
    }

    return {
      accessToken: `${signingInput}.${Buffer.from(signature).toString('base64url')}`,
      expiresIn: ttlSeconds,
    };
  };
};

type KmsClient = Pick<KMSClient, 'send'>;

export const createKmsRs256Signer = (client: KmsClient, keyId: string) =>
  async (message: Uint8Array): Promise<Uint8Array> => {
    const result = await client.send(
      new SignCommand({
        KeyId: keyId,
        Message: message,
        MessageType: 'RAW',
        SigningAlgorithm: KMS_SIGNING_ALGORITHM,
      })
    );
    if (!result.Signature) {
      throw new Error('KMS did not return an Access Token signature.');
    }
    return result.Signature;
  };
