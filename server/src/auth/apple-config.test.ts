import { describe, expect, it, vi } from 'vitest';

import {
  AppleConfigurationError,
  createCachedAppleConfigLoader,
  parseAppleAuthConfig,
} from './apple-config';

const privateKey = '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----';

describe('Apple server configuration', () => {
  it('accepts only a complete PKCS#8 signing configuration', () => {
    expect(
      parseAppleAuthConfig(
        JSON.stringify({ teamId: 'TEAMID', keyId: 'KEYID', privateKey })
      )
    ).toEqual({ teamId: 'TEAMID', keyId: 'KEYID', privateKey });
    expect(() => parseAppleAuthConfig('{}')).toThrow(AppleConfigurationError);
  });

  it('caches valid SecureString content and retries failed reads', async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(
        JSON.stringify({ teamId: 'TEAMID', keyId: 'KEYID', privateKey })
      );
    const load = createCachedAppleConfigLoader(read);
    await expect(load()).rejects.toThrow('temporary');
    await expect(load()).resolves.toMatchObject({ keyId: 'KEYID' });
    await expect(load()).resolves.toMatchObject({ teamId: 'TEAMID' });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
