import { login as loginWithKakaoSdk } from '@react-native-seoul/kakao-login';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import authConfig from '@/src/config/auth.json';
import { requestWorkoutSync } from '@/src/services/workout-sync/workout-sync-events';

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

const createAppleNonce = async (): Promise<string> => {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

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
      return { idToken: token.idToken, accessToken: token.accessToken };
    },
  },
  apple: {
    async login() {
      if (
        Platform.OS !== 'ios' ||
        !(await AppleAuthentication.isAvailableAsync())
      ) {
        throw new AuthUnavailableError(
          'Apple native login is available only on supported Apple devices.'
        );
      }
      const nonce = await createAppleNonce();
      const credential = await AppleAuthentication.signInAsync({
        nonce,
        requestedScopes: [],
      });
      return {
        idToken: credential.identityToken,
        nonce,
        authorizationCode: credential.authorizationCode,
      };
    },
  },
});

export const signInWithKakao = async () => {
  const result = await nativeAuth.signInWithKakao();
  requestWorkoutSync();
  return result;
};

export const signInWithApple = async () => {
  const result = await nativeAuth.signInWithApple();
  requestWorkoutSync();
  return result;
};

export const isAppleSignInAvailable = async () =>
  Platform.OS === 'ios' && AppleAuthentication.isAvailableAsync();

export const signOut = () => nativeAuth.signOut();

export const deleteAccount = () => nativeAuth.deleteAccount();

export const getLoofitAccessToken = () => nativeAuth.getAccessToken();

export const getStoredAuthSession = () => nativeAuth.getCurrentSession();
