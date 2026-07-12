import Constants from 'expo-constants';

const appVersion = Constants.expoConfig?.version ?? Constants.nativeApplicationVersion;

export const APP_VERSION_LABEL = appVersion
  ? `v${appVersion}`
  : null;
