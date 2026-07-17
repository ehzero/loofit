import 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useFonts } from 'expo-font';
import {
  Stack,
  ThemeProvider as NavigationThemeProvider,
  DarkTheme,
  DefaultTheme,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAppStore } from '@/src/store/app-store';
import { ThemeProvider, useTheme } from '@/src/theme/ThemeProvider';
import { ToastProvider, useToast } from '@/src/theme/ToastProvider';
import { subscribeToExternalWorkoutCommands } from '@/src/widgets/pipeline';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({
  duration: 300,
  fade: true,
});

export default function RootLayout() {
  const initialize = useAppStore((state) => state.initialize);
  const refresh = useAppStore((state) => state.refresh);
  const isReady = useAppStore((state) => state.isReady);
  const didInitialize = useRef(false);
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded && !didInitialize.current) {
      didInitialize.current = true;
      initialize();
    }
  }, [initialize, loaded]);

  // Keep the native splash up until the store has loaded the first overview,
  // so the home screen's loading placeholder never flashes before onboarding.
  useEffect(() => {
    if (loaded && isReady) {
      SplashScreen.hideAsync();
    }
  }, [loaded, isReady]);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && didInitialize.current) {
        refresh();
      }
    });
    return () => subscription.remove();
  }, [loaded, refresh]);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    const subscription = subscribeToExternalWorkoutCommands(() => {
      if (didInitialize.current) {
        refresh();
      }
    });
    return () => subscription?.remove();
  }, [loaded, refresh]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider>
        <ToastProvider>
          <StoreErrorPresenter />
          <RootLayoutNav />
        </ToastProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function StoreErrorPresenter() {
  const error = useAppStore((state) => state.error);
  const { showToast } = useToast();

  useEffect(() => {
    if (error) {
      showToast(error);
    }
  }, [error, showToast]);

  return null;
}

function RootLayoutNav() {
  const { scheme, colors } = useTheme();

  const navigationTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: colors.bg,
      card: colors.nav,
      text: colors.tx,
      border: colors.navb,
      primary: colors.accent,
    },
  };

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="routine" />
        <Stack.Screen name="widgets" />
        <Stack.Screen name="record/[id]" />
      </Stack>
    </NavigationThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
