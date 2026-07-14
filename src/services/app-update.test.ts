import { describe, expect, it, vi } from 'vitest';

import { fetchAvailableAppUpdate, isNewerVersion } from './app-update';

describe('app update version comparison', () => {
  it('compares every numeric version segment', () => {
    expect(isNewerVersion('1.0.2', '1.0.1')).toBe(true);
    expect(isNewerVersion('1.10.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('2.0', '1.99.99')).toBe(true);
  });

  it('does not treat equal, older, or malformed versions as updates', () => {
    expect(isNewerVersion('1.0.0', '1')).toBe(false);
    expect(isNewerVersion('1.0.1', '1.0.2')).toBe(false);
    expect(isNewerVersion('1.0-beta', '1.0.0')).toBe(false);
  });
});

describe('App Store update lookup', () => {
  it('returns a newer public App Store version and its product URL', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            trackId: 6789599963,
            version: '1.0.3',
            trackViewUrl: 'https://apps.apple.com/kr/app/id6789599963',
          },
        ],
      }),
    }));

    await expect(fetchAvailableAppUpdate('1.0.2', { fetcher })).resolves.toEqual({
      version: '1.0.3',
      storeUrl: 'https://apps.apple.com/kr/app/id6789599963',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://itunes.apple.com/lookup?id=6789599963&country=kr',
      { signal: undefined }
    );
  });

  it('returns nothing when the public version is not newer', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{ trackId: 6789599963, version: '1.0.2' }],
      }),
    }));

    await expect(fetchAvailableAppUpdate('1.0.2', { fetcher })).resolves.toBeNull();
  });

  it('uses the known App Store page when the lookup URL is missing or unsafe', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            trackId: 6789599963,
            version: '1.1.0',
            trackViewUrl: 'https://example.com/not-the-app-store',
          },
        ],
      }),
    }));

    await expect(fetchAvailableAppUpdate('1.0.2', { fetcher })).resolves.toEqual({
      version: '1.1.0',
      storeUrl: 'https://apps.apple.com/kr/app/id6789599963',
    });
  });
});
