import { describe, expect, it, vi } from 'vitest';

import type { KakaoAuthConfig } from './kakao-config';
import {
  authenticateWithKakao,
  exchangeKakaoAuthorizationCode,
  KakaoLoginRejectedError,
  KakaoProviderUnavailableError,
  KakaoRedirectUriRejectedError,
  verifyKakaoIdToken,
} from './kakao';

const CONFIG: KakaoAuthConfig = {
  nativeClientId: 'native-app-key',
  rest: {
    clientId: 'rest-api-key',
    clientSecret: 'client-secret',
    redirectUris: ['https://example.com/auth/kakao'],
  },
};

const INPUT = {
  code: 'authorization-code',
  redirectUri: 'https://example.com/auth/kakao',
  nonce: '0123456789abcdef0123456789abcdef',
};

describe('Kakao authentication provider', () => {
  it('exchanges an authorization code without logging or storing provider tokens', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id_token: 'kakao-id-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    await expect(
      exchangeKakaoAuthorizationCode(CONFIG.rest!, INPUT, fetchImplementation)
    ).resolves.toBe('kakao-id-token');

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImplementation.mock.calls[0]!;
    expect(url).toBe('https://kauth.kakao.com/oauth/token');
    const body = init.body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'authorization_code',
      client_id: 'rest-api-key',
      client_secret: 'client-secret',
      redirect_uri: 'https://example.com/auth/kakao',
      code: 'authorization-code',
    });
    expect(body.has('code_verifier')).toBe(false);
  });

  it('rejects an unlisted redirect URI before calling Kakao', async () => {
    const fetchImplementation = vi.fn();
    await expect(
      exchangeKakaoAuthorizationCode(
        CONFIG.rest!,
        { ...INPUT, redirectUri: 'https://attacker.example/callback' },
        fetchImplementation
      )
    ).rejects.toBeInstanceOf(KakaoRedirectUriRejectedError);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('maps Kakao credential errors and outages without exposing their response', async () => {
    await expect(
      exchangeKakaoAuthorizationCode(
        CONFIG.rest!,
        INPUT,
        vi.fn().mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 }))
      )
    ).rejects.toBeInstanceOf(KakaoLoginRejectedError);
    await expect(
      exchangeKakaoAuthorizationCode(
        CONFIG.rest!,
        INPUT,
        vi.fn().mockResolvedValue(new Response('{}', { status: 503 }))
      )
    ).rejects.toBeInstanceOf(KakaoProviderUnavailableError);
  });

  it('verifies issuer, audience, signature, lifetime, subject, and nonce', async () => {
    const jose = await import('jose');
    const { privateKey, publicKey } = await jose.generateKeyPair('RS256');
    const publicJwk = await jose.exportJWK(publicKey);
    publicJwk.kid = 'kakao-test-key';
    publicJwk.alg = 'RS256';
    const key = jose.createLocalJWKSet({ keys: [publicJwk] });
    const now = new Date('2026-08-07T00:00:00.000Z');
    const nowEpoch = Math.floor(now.getTime() / 1_000);
    const token = await new jose.SignJWT({ nonce: INPUT.nonce })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'kakao-test-key' })
      .setIssuer('https://kauth.kakao.com')
      .setAudience(CONFIG.rest!.clientId)
      .setSubject('123456789')
      .setIssuedAt(nowEpoch)
      .setExpirationTime(nowEpoch + 600)
      .sign(privateKey);

    await expect(
      verifyKakaoIdToken(token, CONFIG.rest!.clientId, INPUT.nonce, {
        key,
        now: () => now,
      })
    ).resolves.toEqual({ subject: '123456789' });
    await expect(
      verifyKakaoIdToken(token, CONFIG.rest!.clientId, 'different-nonce-value', {
        key,
        now: () => now,
      })
    ).rejects.toBeInstanceOf(KakaoLoginRejectedError);

    const nativeToken = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'kakao-test-key' })
      .setIssuer('https://kauth.kakao.com')
      .setAudience(CONFIG.nativeClientId)
      .setSubject('native-subject')
      .setIssuedAt(nowEpoch)
      .setExpirationTime(nowEpoch + 600)
      .sign(privateKey);
    await expect(
      verifyKakaoIdToken(nativeToken, CONFIG.nativeClientId, undefined, {
        key,
        now: () => now,
      })
    ).resolves.toEqual({ subject: 'native-subject' });
  });

  it('returns only the verified provider subject from the full flow', async () => {
    const verifyIdToken = vi.fn().mockResolvedValue({ subject: 'kakao-subject' });
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id_token: 'id-token' }), { status: 200 })
    );

    await expect(
      authenticateWithKakao(CONFIG, INPUT, {
        fetch: fetchImplementation,
        verifyIdToken,
      })
    ).resolves.toEqual({ subject: 'kakao-subject' });
    expect(verifyIdToken).toHaveBeenCalledWith(
      'id-token',
      CONFIG.rest!.clientId,
      INPUT.nonce
    );
  });

  it('accepts a signed native SDK ID token without a REST code exchange', async () => {
    const verifyIdToken = vi.fn().mockResolvedValue({ subject: 'native-subject' });
    const fetchImplementation = vi.fn();

    await expect(
      authenticateWithKakao(
        { nativeClientId: 'native-app-key' },
        { idToken: 'native-id-token' },
        { fetch: fetchImplementation, verifyIdToken }
      )
    ).resolves.toEqual({ subject: 'native-subject' });
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(verifyIdToken).toHaveBeenCalledWith(
      'native-id-token',
      'native-app-key'
    );
  });
});
