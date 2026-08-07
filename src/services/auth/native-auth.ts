import { login as loginWithKakaoSdk } from '@react-native-seoul/kakao-login';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import authConfig from '@/src/config/auth.json';

import {
  AuthUnavailableError,
  createAuthService,
  createSerializedAuthSessionStore,
} from './auth-service';

const AUTH_SESSION_KEY = 'loofit.auth.session.v1';
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const sessionStore = createSerializedAuthSessionStore({
  get: () => SecureStore.getItemAsync(AUTH_SESSION_KEY, secureStoreOptions),
  set: (value) =>
    SecureStore.setItemAsync(AUTH_SESSION_KEY, value, secureStoreOptions),
  clear: () => SecureStore.deleteItemAsync(AUTH_SESSION_KEY, secureStoreOptions),
});

export const nativeAuth = createAuthService({
  apiBaseUrl: authConfig.apiBaseUrl,
  sessionStore,
  kakao: {
    async login() {
      if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        throw new AuthUnavailableError(
          'Kakao native login is available only on iOS and Android.'
        );
      }
      const token = await loginWithKakaoSdk();
      return { idToken: token.idToken };
    },
  },
});

export const signInWithKakao = () => nativeAuth.signInWithKakao();

export const getLoofitAccessToken = () => nativeAuth.getAccessToken();

export const getStoredAuthSession = () => nativeAuth.getCurrentSession();
