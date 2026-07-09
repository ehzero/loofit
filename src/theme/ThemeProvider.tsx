import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';

import { getAppSetting, setAppSetting } from '@/src/db/repository';

import {
  DEFAULT_ACCENT,
  makeColors,
  type ThemeColors,
  type ThemeMode,
  type ThemeScheme,
} from './tokens';

const MODE_KEY = 'theme_mode';
const ACCENT_KEY = 'theme_accent';

type ThemeContextValue = {
  mode: ThemeMode;
  scheme: ThemeScheme;
  accent: string;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: string) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const deviceScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [accent, setAccentState] = useState<string>(DEFAULT_ACCENT);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [savedMode, savedAccent] = await Promise.all([
        getAppSetting(MODE_KEY),
        getAppSetting(ACCENT_KEY),
      ]);
      if (cancelled) {
        return;
      }
      if (savedMode === 'system' || savedMode === 'dark' || savedMode === 'light') {
        setModeState(savedMode);
      }
      if (savedAccent) {
        setAccentState(savedAccent);
      }
    })().catch(() => {
      /* fall back to defaults if settings can't be read */
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    setAppSetting(MODE_KEY, next).catch(() => {});
  }, []);

  const setAccent = useCallback((next: string) => {
    setAccentState(next);
    setAppSetting(ACCENT_KEY, next).catch(() => {});
  }, []);

  const scheme: ThemeScheme =
    mode === 'system' ? (deviceScheme === 'light' ? 'light' : 'dark') : mode;

  const colors = useMemo(() => makeColors(scheme, accent), [scheme, accent]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, scheme, accent, colors, setMode, setAccent }),
    [mode, scheme, accent, colors, setMode, setAccent]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return value;
}
