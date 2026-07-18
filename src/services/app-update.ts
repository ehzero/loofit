import { BRAND } from '@/src/config/brand';

const APP_STORE_LOOKUP_CACHE_BUCKET_MS = 60 * 60 * 1_000;

export type AppUpdateInfo = {
  version: string;
  storeUrl: string;
};

type LookupResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

type LookupFetcher = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<LookupResponse>;

type LookupOptions = {
  signal?: AbortSignal;
  fetcher?: LookupFetcher;
};

export async function fetchAvailableAppUpdate(
  currentVersion: string,
  options: LookupOptions = {}
): Promise<AppUpdateInfo | null> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(appStoreLookupUrl(), { signal: options.signal });

  if (!response.ok) {
    throw new Error('App Store version lookup failed.');
  }

  const result = parseLookupResult(await response.json());
  if (!result || !isNewerVersion(result.version, currentVersion)) {
    return null;
  }

  return result;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = parseVersion(candidate);
  const currentParts = parseVersion(current);

  if (!candidateParts || !currentParts) {
    return false;
  }

  const length = Math.max(candidateParts.length, currentParts.length);
  for (let index = 0; index < length; index += 1) {
    const candidatePart = candidateParts[index] ?? 0;
    const currentPart = currentParts[index] ?? 0;

    if (candidatePart !== currentPart) {
      return candidatePart > currentPart;
    }
  }

  return false;
}

function appStoreLookupUrl(): string {
  const { id, country } = BRAND.appStore;
  const cacheBucket = Math.floor(Date.now() / APP_STORE_LOOKUP_CACHE_BUCKET_MS);
  const lookupUrl = `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&country=${encodeURIComponent(country)}`;

  return `${lookupUrl}&cacheBucket=${cacheBucket}`;
}

function parseLookupResult(payload: unknown): AppUpdateInfo | null {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return null;
  }

  const result = payload.results.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.trackId === Number(BRAND.appStore.id) &&
      typeof candidate.version === 'string'
  );

  if (!isRecord(result) || typeof result.version !== 'string') {
    return null;
  }

  return {
    version: result.version,
    storeUrl: isAppleStoreUrl(result.trackViewUrl)
      ? result.trackViewUrl
      : `https://apps.apple.com/${BRAND.appStore.country}/app/id${BRAND.appStore.id}`,
  };
}

function parseVersion(version: string): number[] | null {
  const segments = version.trim().split('.');
  if (segments.length === 0 || segments.some((segment) => !/^\d+$/.test(segment))) {
    return null;
  }

  return segments.map(Number);
}

function isAppleStoreUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['apps.apple.com', 'itunes.apple.com'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
