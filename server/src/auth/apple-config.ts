export type AppleAuthConfig = {
  teamId: string;
  keyId: string;
  privateKey: string;
};

export class AppleConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppleConfigurationError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppleConfigurationError(
      `Apple configuration field ${field} must be a non-empty string.`
    );
  }
  return value;
};

export const parseAppleAuthConfig = (value: string): AppleAuthConfig => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new AppleConfigurationError('Apple configuration must be valid JSON.');
  }
  if (!isRecord(parsed)) {
    throw new AppleConfigurationError('Apple configuration must be a JSON object.');
  }
  const privateKey = requireString(parsed.privateKey, 'privateKey');
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new AppleConfigurationError(
      'Apple configuration privateKey must be a PKCS#8 private key.'
    );
  }
  return {
    teamId: requireString(parsed.teamId, 'teamId'),
    keyId: requireString(parsed.keyId, 'keyId'),
    privateKey,
  };
};

export const createCachedAppleConfigLoader = (
  readParameter: () => Promise<string | undefined>
) => {
  let cached: Promise<AppleAuthConfig> | undefined;
  return (): Promise<AppleAuthConfig> => {
    cached ??= readParameter()
      .then((value) => {
        if (!value) {
          throw new AppleConfigurationError(
            'Apple configuration parameter has no value.'
          );
        }
        return parseAppleAuthConfig(value);
      })
      .catch((error: unknown) => {
        cached = undefined;
        throw error;
      });
    return cached;
  };
};
