import { describe, expect, it } from 'vitest';

import {
  AppleLoginRejectedError,
  authenticateWithApple,
  verifyAppleIdToken,
} from './apple';

const AUDIENCE = 'com.loofit.app';
const NONCE = '0123456789abcdef0123456789abcdef';

describe('Apple authentication provider', () => {
  it('verifies signature, issuer, audience, lifetime, subject, and nonce', async () => {
    const jose = await import('jose');
    const { privateKey, publicKey } = await jose.generateKeyPair('RS256');
    const publicJwk = await jose.exportJWK(publicKey);
    publicJwk.kid = 'apple-test-key';
    publicJwk.alg = 'RS256';
    const key = jose.createLocalJWKSet({ keys: [publicJwk] });
    const now = new Date('2026-08-07T00:00:00.000Z');
    const nowEpoch = Math.floor(now.getTime() / 1_000);
    const token = await new jose.SignJWT({
      nonce: NONCE,
      email: 'private@example.com',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'apple-test-key' })
      .setIssuer('https://appleid.apple.com')
      .setAudience(AUDIENCE)
      .setSubject('apple-user-subject')
      .setIssuedAt(nowEpoch)
      .setExpirationTime(nowEpoch + 600)
      .sign(privateKey);

    await expect(
      verifyAppleIdToken(token, AUDIENCE, NONCE, {
        key,
        now: () => now,
      })
    ).resolves.toEqual({ subject: 'apple-user-subject' });
    await expect(
      verifyAppleIdToken(token, AUDIENCE, 'different-nonce-value', {
        key,
        now: () => now,
      })
    ).rejects.toBeInstanceOf(AppleLoginRejectedError);
    await expect(
      verifyAppleIdToken(token, 'wrong.client.id', NONCE, {
        key,
        now: () => now,
      })
    ).rejects.toBeInstanceOf(AppleLoginRejectedError);
  });

  it('returns only the verified Apple subject from the native flow', async () => {
    const jose = await import('jose');
    const { privateKey, publicKey } = await jose.generateKeyPair('RS256');
    const publicJwk = await jose.exportJWK(publicKey);
    publicJwk.kid = 'apple-test-key';
    publicJwk.alg = 'RS256';
    const key = jose.createLocalJWKSet({ keys: [publicJwk] });
    const now = new Date('2026-08-07T00:00:00.000Z');
    const nowEpoch = Math.floor(now.getTime() / 1_000);
    const token = await new jose.SignJWT({ nonce: NONCE })
      .setProtectedHeader({ alg: 'RS256', kid: 'apple-test-key' })
      .setIssuer('https://appleid.apple.com')
      .setAudience(AUDIENCE)
      .setSubject('apple-user-subject')
      .setIssuedAt(nowEpoch)
      .setExpirationTime(nowEpoch + 600)
      .sign(privateKey);

    await expect(
      authenticateWithApple(
        AUDIENCE,
        { idToken: token, nonce: NONCE },
        { key, now: () => now }
      )
    ).resolves.toEqual({ subject: 'apple-user-subject' });
  });
});
