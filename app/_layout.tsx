import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { AppState, useColorScheme } from 'react-native';
import 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useAppStore } from '@/src/store/app-store';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const initialize = useAppStore((state) => state.initialize);
  const refresh = useAppStore((state) => state.refresh);
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
      SplashScreen.hideAsync();
    }
  }, [initialize, loaded]);

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

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="session" options={{ title: '운동 중', presentation: 'modal' }} />
        <Stack.Screen name="record/[id]" options={{ title: '기록 상세' }} />
      </Stack>
    </ThemeProvider>
  );
}
