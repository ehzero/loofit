import { describe, expect, it } from 'vitest';

import {
  createAuthIdentityItem,
  createRefreshToken,
  hashProviderSubject,
  hashRefreshToken,
  identityKey,
  parseRefreshToken,
} from './model';

const SESSION_ID = '22222222-2222-4222-8222-222222222222';

describe('auth model', () => {
  it('uses provider-scoped hashes without persisting the raw subject in keys', () => {
    const subject = 'provider-user-123';
    const kakaoKey = identityKey('KAKAO', subject);
    const appleKey = identityKey('APPLE', subject);
    const item = createAuthIdentityItem(
      'KAKAO',
      subject,
      '11111111-1111-4111-8111-111111111111',
      '2026-08-07T00:00:00.000Z'
    );

    expect(kakaoKey.pk).not.toContain(subject);
    expect(kakaoKey.pk).not.toBe(appleKey.pk);
    expect(item.subjectHash).toBe(hashProviderSubject('KAKAO', subject));
    expect(JSON.stringify(item)).not.toContain(subject);
  });

  it('creates a structured opaque refresh token and hashes the full credential', () => {
    const token = createRefreshToken(SESSION_ID, 'A'.repeat(43));

    expect(token).toBe(`lrt1.${SESSION_ID}.${'A'.repeat(43)}`);
    expect(parseRefreshToken(token)).toEqual({ sessionId: SESSION_ID });
    expect(hashRefreshToken(token)).not.toContain(token);
    expect(hashRefreshToken(token)).toHaveLength(43);
  });

  it('rejects malformed refresh tokens', () => {
    expect(() => parseRefreshToken('invalid')).toThrow('Invalid refresh token.');
    expect(() => createRefreshToken(SESSION_ID, 'short')).toThrow(
      'Invalid refresh token components.'
    );
  });
});
