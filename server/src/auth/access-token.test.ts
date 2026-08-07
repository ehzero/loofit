import { SignCommand } from '@aws-sdk/client-kms';
import { describe, expect, it, vi } from 'vitest';

import { createAccessTokenIssuer, createKmsRs256Signer } from './access-token';

const decodeSegment = (segment: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;

describe('access token issuer', () => {
  it('creates a KMS-signable RS256 JWT with the required claims', async () => {
    const sign = vi.fn().mockResolvedValue(Buffer.from('signature'));
    const issue = createAccessTokenIssuer({
      issuer: 'https://api.example.com/',
      audience: 'loofit-api',
      keyId: 'kms-key-id',
      ttlSeconds: 900,
      sign,
      now: () => new Date('2026-08-07T00:00:00.000Z'),
      createTokenId: () => 'token-id',
    });

    const result = await issue({ userId: 'user-id', sessionId: 'session-id' });
    const [header, payload, signature] = result.accessToken.split('.');

    expect(decodeSegment(header!)).toEqual({
      alg: 'RS256',
      typ: 'JWT',
      kid: 'kms-key-id',
    });
    expect(decodeSegment(payload!)).toEqual({
      sub: 'user-id',
      sid: 'session-id',
      iss: 'https://api.example.com',
      aud: 'loofit-api',
      iat: 1_786_060_800,
      exp: 1_786_061_700,
      jti: 'token-id',
    });
    expect(signature).toBe(Buffer.from('signature').toString('base64url'));
    expect(result.expiresIn).toBe(900);
    expect(Buffer.from(sign.mock.calls[0]![0]).toString('ascii')).toBe(
      `${header}.${payload}`
    );
  });

  it('uses KMS raw RS256 signing', async () => {
    const send = vi.fn().mockResolvedValue({ Signature: Buffer.from('signed') });
    const sign = createKmsRs256Signer({ send } as never, 'key-id');

    await expect(sign(Buffer.from('header.payload'))).resolves.toEqual(
      Buffer.from('signed')
    );
    const command = send.mock.calls[0]![0] as SignCommand;
    expect(command).toBeInstanceOf(SignCommand);
    expect(command.input).toMatchObject({
      KeyId: 'key-id',
      MessageType: 'RAW',
      SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
    });
  });
});
