import { GetPublicKeyCommand, KMSClient } from '@aws-sdk/client-kms';
import { createPublicKey } from 'node:crypto';

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';

const RSA_2048 = 'RSA_2048';
const SIGN_VERIFY = 'SIGN_VERIFY';
const KMS_RS256_ALGORITHM = 'RSASSA_PKCS1_V1_5_SHA_256';
const JWT_RS256_ALGORITHM = 'RS256';

type PublicKeyResult = {
  PublicKey?: Uint8Array;
  KeySpec?: string;
  KeyUsage?: string;
  SigningAlgorithms?: readonly string[];
};

type IssuerHandlerOptions = {
  issuer: string;
  signingKeyId: string;
  keyId: string;
  algorithm: string;
  cacheControlSeconds: number;
  getPublicKey: (keyId: string) => Promise<PublicKeyResult>;
};

type RsaJwk = {
  kty: 'RSA';
  n: string;
  e: string;
  kid: string;
  alg: 'RS256';
  use: 'sig';
};

type IssuerHandler = (
  event: APIGatewayProxyEventV2
) => Promise<APIGatewayProxyResultV2>;

const jsonResponse = (
  statusCode: number,
  body: unknown,
  cacheControl: string
): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: {
    'cache-control': cacheControl,
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  },
  body: JSON.stringify(body),
});

const requireEnvironment = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const parseCacheControlSeconds = (value: string): number => {
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new Error('JWKS_CACHE_CONTROL_SECONDS must be a non-negative integer.');
  }
  return seconds;
};

const normalizeIssuer = (value: string): string => {
  const issuer = new URL(value);
  if (issuer.protocol !== 'https:') {
    throw new Error('JWT_ISSUER must use HTTPS.');
  }
  return issuer.toString().replace(/\/$/, '');
};

const toRsaJwk = (result: PublicKeyResult, keyId: string): RsaJwk => {
  if (!result.PublicKey) {
    throw new Error('KMS did not return a public key.');
  }
  if (result.KeySpec !== RSA_2048 || result.KeyUsage !== SIGN_VERIFY) {
    throw new Error('KMS key must be an RSA_2048 SIGN_VERIFY key.');
  }
  if (!result.SigningAlgorithms?.includes(KMS_RS256_ALGORITHM)) {
    throw new Error('KMS key does not support RS256 signing.');
  }

  const publicJwk = createPublicKey({
    key: Buffer.from(result.PublicKey),
    format: 'der',
    type: 'spki',
  }).export({ format: 'jwk' });

  if (publicJwk.kty !== 'RSA' || !publicJwk.n || !publicJwk.e) {
    throw new Error('KMS public key could not be converted to an RSA JWK.');
  }

  return {
    kty: 'RSA',
    n: publicJwk.n,
    e: publicJwk.e,
    kid: keyId,
    alg: JWT_RS256_ALGORITHM,
    use: 'sig',
  };
};

export const createIssuerHandler = (
  options: IssuerHandlerOptions
): IssuerHandler => {
  const issuer = normalizeIssuer(options.issuer);
  if (options.algorithm !== JWT_RS256_ALGORITHM) {
    throw new Error('Only RS256 is supported by the issuer foundation.');
  }

  const jwksUri = `${issuer}/.well-known/jwks.json`;
  const cacheControl = `public, max-age=${options.cacheControlSeconds}`;
  let jwksPromise: Promise<{ keys: RsaJwk[] }> | undefined;

  const loadJwks = (): Promise<{ keys: RsaJwk[] }> => {
    jwksPromise ??= options
      .getPublicKey(options.signingKeyId)
      .then((result) => ({ keys: [toRsaJwk(result, options.keyId)] }))
      .catch((error: unknown) => {
        jwksPromise = undefined;
        throw error;
      });
    return jwksPromise;
  };

  return async (event) => {
    if (event.rawPath === '/.well-known/openid-configuration') {
      return jsonResponse(
        200,
        {
          issuer,
          jwks_uri: jwksUri,
          id_token_signing_alg_values_supported: [JWT_RS256_ALGORITHM],
          subject_types_supported: ['public'],
        },
        cacheControl
      );
    }

    if (event.rawPath === '/.well-known/jwks.json') {
      return jsonResponse(200, await loadJwks(), cacheControl);
    }

    return jsonResponse(404, { message: 'Not found.' }, 'no-store');
  };
};

const kmsClient = new KMSClient({});
let defaultHandler: IssuerHandler | undefined;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  defaultHandler ??= createIssuerHandler({
    issuer: requireEnvironment('JWT_ISSUER'),
    signingKeyId: requireEnvironment('JWT_SIGNING_KEY_ID'),
    keyId: requireEnvironment('JWT_KEY_ID'),
    algorithm: requireEnvironment('JWT_ALGORITHM'),
    cacheControlSeconds: parseCacheControlSeconds(
      requireEnvironment('JWKS_CACHE_CONTROL_SECONDS')
    ),
    getPublicKey: (keyId) => kmsClient.send(new GetPublicKeyCommand({ KeyId: keyId })),
  });

  return defaultHandler(event);
};
