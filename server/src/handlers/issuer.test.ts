import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createIssuerHandler } from './issuer';

const publicKey = generateKeyPairSync('rsa', {
  modulusLength: 2_048,
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'der' },
}).publicKey;

const callHandler = async (
  handler: ReturnType<typeof createIssuerHandler>,
  rawPath: string
) => {
  const response = await handler({ rawPath } as never);

  if (!response || typeof response === 'string') {
    throw new Error('Expected an API Gateway v2 response object.');
  }
  return response;
};

const createOptions = () => ({
  issuer: 'https://api.example.com/',
  signingKeyId: 'kms-key-id',
  keyId: 'kms-key-id',
  algorithm: 'RS256',
  cacheControlSeconds: 3_600,
  getPublicKey: vi.fn(async () => ({
    PublicKey: publicKey,
    KeySpec: 'RSA_2048',
    KeyUsage: 'SIGN_VERIFY',
    SigningAlgorithms: ['RSASSA_PKCS1_V1_5_SHA_256'],
  })),
});

describe('issuer handler', () => {
  it('publishes issuer metadata without reading KMS', async () => {
    const options = createOptions();
    const response = await callHandler(
      createIssuerHandler(options),
      '/.well-known/openid-configuration'
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    });
    expect(JSON.parse(response.body ?? '{}')).toEqual({
      issuer: 'https://api.example.com',
      jwks_uri: 'https://api.example.com/.well-known/jwks.json',
      id_token_signing_alg_values_supported: ['RS256'],
      subject_types_supported: ['public'],
    });
    expect(options.getPublicKey).not.toHaveBeenCalled();
  });

  it('converts and caches the KMS public key as an RS256 JWKS', async () => {
    const options = createOptions();
    const handler = createIssuerHandler(options);
    const firstResponse = await callHandler(handler, '/.well-known/jwks.json');
    await callHandler(handler, '/.well-known/jwks.json');

    expect(firstResponse.statusCode).toBe(200);
    expect(JSON.parse(firstResponse.body ?? '{}')).toEqual({
      keys: [
        expect.objectContaining({
          kty: 'RSA',
          kid: 'kms-key-id',
          alg: 'RS256',
          use: 'sig',
          n: expect.any(String),
          e: expect.any(String),
        }),
      ],
    });
    expect(options.getPublicKey).toHaveBeenCalledTimes(1);
    expect(options.getPublicKey).toHaveBeenCalledWith('kms-key-id');
  });

  it('rejects a KMS key that cannot sign RS256 tokens', async () => {
    const options = createOptions();
    options.getPublicKey.mockResolvedValueOnce({
      PublicKey: publicKey,
      KeySpec: 'RSA_2048',
      KeyUsage: 'SIGN_VERIFY',
      SigningAlgorithms: ['RSASSA_PSS_SHA_256'],
    });

    await expect(
      callHandler(createIssuerHandler(options), '/.well-known/jwks.json')
    ).rejects.toThrow('KMS key does not support RS256 signing.');
  });

  it('returns a non-cacheable 404 for unknown paths', async () => {
    const response = await callHandler(createIssuerHandler(createOptions()), '/unknown');

    expect(response.statusCode).toBe(404);
    expect(response.headers).toMatchObject({ 'cache-control': 'no-store' });
    expect(JSON.parse(response.body ?? '{}')).toEqual({ message: 'Not found.' });
  });
});
