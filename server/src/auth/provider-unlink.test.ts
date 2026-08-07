import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  createAppleClientSecret,
  exchangeAndRevokeAppleAuthorization,
  ProviderCredentialRejectedError,
  unlinkKakaoAccount,
} from './provider-unlink';

const { privateKey: applePrivateKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});
const appleConfig = {
  teamId: '9WVM24DWTU',
  keyId: 'APPLEKEY1',
  privateKey: applePrivateKey
    .export({ format: 'pem', type: 'pkcs8' })
    .toString(),
};

describe('social provider unlink', () => {
  it('requires the Kakao unlink response to match the reauthenticated subject', async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response(JSON.stringify({ id: 1234 }), { status: 200 })
    );
    await expect(
      unlinkKakaoAccount('access-token', '1234', fetchImplementation)
    ).resolves.toBeUndefined();
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://kapi.kakao.com/v1/user/unlink',
      expect.objectContaining({
        method: 'POST',
        headers: { authorization: 'Bearer access-token' },
      })
    );
    await expect(
      unlinkKakaoAccount(
        'access-token',
        '9999',
        vi.fn(async () =>
          new Response(JSON.stringify({ id: 1234 }), { status: 200 })
        )
      )
    ).rejects.toBeInstanceOf(ProviderCredentialRejectedError);
  });

  it('creates a five-minute Apple client secret with the configured key', async () => {
    const { decodeJwt, decodeProtectedHeader } = await import('jose');
    const now = new Date('2026-08-07T00:00:00.000Z');
    const token = await createAppleClientSecret(
      'com.loofit.app',
      appleConfig,
      now
    );
    expect(decodeProtectedHeader(token)).toMatchObject({
      alg: 'ES256',
      kid: 'APPLEKEY1',
    });
    expect(decodeJwt(token)).toMatchObject({
      iss: '9WVM24DWTU',
      sub: 'com.loofit.app',
      aud: 'https://appleid.apple.com',
      iat: Math.floor(now.getTime() / 1_000),
      exp: Math.floor(now.getTime() / 1_000) + 300,
    });
  });

  it('exchanges a fresh Apple authorization code and revokes its refresh token', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            refresh_token: 'apple-refresh-token',
            id_token: 'exchanged-id-token',
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await exchangeAndRevokeAppleAuthorization({
      clientId: 'com.loofit.app',
      authorizationCode: 'authorization-code',
      config: appleConfig,
      expectedSubject: 'apple-subject',
      verifyExchangedIdToken: vi
        .fn()
        .mockResolvedValue({ subject: 'apple-subject' }),
      fetchImplementation,
    });

    const tokenRequest = fetchImplementation.mock.calls[0]?.[1];
    expect(String(tokenRequest?.body)).toContain('code=authorization-code');
    const revokeRequest = fetchImplementation.mock.calls[1]?.[1];
    expect(String(revokeRequest?.body)).toContain(
      'token=apple-refresh-token'
    );
    expect(String(revokeRequest?.body)).toContain(
      'token_type_hint=refresh_token'
    );
  });
});
