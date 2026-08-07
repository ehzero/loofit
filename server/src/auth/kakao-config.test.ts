import { describe, expect, it, vi } from 'vitest';

import {
  createCachedKakaoConfigLoader,
  KakaoConfigurationError,
  parseKakaoAuthConfig,
} from './kakao-config';

describe('Kakao authentication configuration', () => {
  it('parses the secret parameter without accepting missing fields', () => {
    expect(
      parseKakaoAuthConfig(
        JSON.stringify({
          nativeClientId: 'native-app-key',
          rest: {
            clientId: 'rest-api-key',
            clientSecret: 'client-secret',
            redirectUris: ['https://example.com/auth/kakao'],
          },
        })
      )
    ).toEqual({
      nativeClientId: 'native-app-key',
      rest: {
        clientId: 'rest-api-key',
        clientSecret: 'client-secret',
        redirectUris: ['https://example.com/auth/kakao'],
      },
    });
    expect(
      parseKakaoAuthConfig('{"nativeClientId":"native-app-key"}')
    ).toEqual({ nativeClientId: 'native-app-key' });
    expect(() => parseKakaoAuthConfig('{}')).toThrow(KakaoConfigurationError);
  });

  it('caches a valid configuration and retries after a failed read', async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(
        JSON.stringify({
          nativeClientId: 'native-app-key',
        })
      );
    const load = createCachedKakaoConfigLoader(read);

    await expect(load()).rejects.toThrow('temporary failure');
    await expect(load()).resolves.toMatchObject({
      nativeClientId: 'native-app-key',
    });
    await expect(load()).resolves.toMatchObject({
      nativeClientId: 'native-app-key',
    });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
