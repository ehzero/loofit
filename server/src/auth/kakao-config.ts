export type KakaoAuthConfig = {
  nativeClientId: string;
  rest?: KakaoRestAuthConfig;
};

export type KakaoRestAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUris: readonly string[];
};

export class KakaoConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KakaoConfigurationError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requireNonEmptyString = (
  value: unknown,
  fieldName: string
): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new KakaoConfigurationError(
      `Kakao configuration field ${fieldName} must be a non-empty string.`
    );
  }
  return value;
};

export const parseKakaoAuthConfig = (value: string): KakaoAuthConfig => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new KakaoConfigurationError('Kakao configuration must be valid JSON.');
  }
  if (!isRecord(parsed)) {
    throw new KakaoConfigurationError('Kakao configuration must be a JSON object.');
  }

  const nativeClientId = requireNonEmptyString(
    parsed.nativeClientId,
    'nativeClientId'
  );
  if (parsed.rest === undefined) {
    return { nativeClientId };
  }
  if (!isRecord(parsed.rest)) {
    throw new KakaoConfigurationError(
      'Kakao configuration field rest must be a JSON object.'
    );
  }
  const clientId = requireNonEmptyString(parsed.rest.clientId, 'rest.clientId');
  const clientSecret = requireNonEmptyString(
    parsed.rest.clientSecret,
    'rest.clientSecret'
  );
  if (
    !Array.isArray(parsed.rest.redirectUris) ||
    parsed.rest.redirectUris.length === 0
  ) {
    throw new KakaoConfigurationError(
      'Kakao configuration field rest.redirectUris must be a non-empty array.'
    );
  }
  const redirectUris = parsed.rest.redirectUris.map((item, index) =>
    requireNonEmptyString(item, `rest.redirectUris[${index}]`)
  );
  if (new Set(redirectUris).size !== redirectUris.length) {
    throw new KakaoConfigurationError(
      'Kakao configuration redirectUris must not contain duplicates.'
    );
  }

  return {
    nativeClientId,
    rest: { clientId, clientSecret, redirectUris },
  };
};

export const createCachedKakaoConfigLoader = (
  readParameter: () => Promise<string | undefined>
) => {
  let cached: Promise<KakaoAuthConfig> | undefined;
  return (): Promise<KakaoAuthConfig> => {
    cached ??= readParameter()
      .then((value) => {
        if (!value) {
          throw new KakaoConfigurationError(
            'Kakao configuration parameter has no value.'
          );
        }
        return parseKakaoAuthConfig(value);
      })
      .catch((error: unknown) => {
        cached = undefined;
        throw error;
      });
    return cached;
  };
};
