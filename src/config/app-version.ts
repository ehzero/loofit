import Constants from 'expo-constants';

const appVersion = Constants.expoConfig?.version ?? Constants.nativeApplicationVersion;

export const APP_VERSION = appVersion ?? null;
export const APP_VERSION_LABEL = APP_VERSION ? `v${APP_VERSION}` : null;
