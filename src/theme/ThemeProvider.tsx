import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';

import { getAppSetting, setAppSetting } from '@/src/db/repository';
import { appOperationCoordinator } from '@/src/store/app-operation-coordinator';
import { updateAppWidgetTheme } from '@/src/widgets/pipeline';

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
  setMode: (mode: ThemeMode) => Promise<void>;
  setAccent: (accent: string) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const deviceScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [accent, setAccentState] = useState<string>(DEFAULT_ACCENT);
  const [isHydrated, setIsHydrated] = useState(false);
  const modeSelectionRevision = useRef(0);
  const accentSelectionRevision = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const requestedModeRevision = modeSelectionRevision.current;
    const requestedAccentRevision = accentSelectionRevision.current;

    appOperationCoordinator
      .runInPipeline(async () => {
        const savedMode = await getAppSetting(MODE_KEY);
        const savedAccent = await getAppSetting(ACCENT_KEY);
        return { savedMode, savedAccent };
      })
      .then(({ savedMode, savedAccent }) => {
        if (cancelled) {
          return;
        }
        if (
          modeSelectionRevision.current === requestedModeRevision &&
          (savedMode === 'system' || savedMode === 'dark' || savedMode === 'light')
        ) {
          setModeState(savedMode);
        }
        if (accentSelectionRevision.current === requestedAccentRevision && savedAccent) {
          setAccentState(savedAccent);
        }
        setIsHydrated(true);
      })
      .catch(() => {
        /* fall back to defaults if settings can't be read */
        if (!cancelled) {
          setIsHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    modeSelectionRevision.current += 1;
    const persistence = appOperationCoordinator.runInPipeline(() =>
      setAppSetting(MODE_KEY, next).catch(() => {})
    );
    setModeState(next);
    return persistence;
  }, []);

  const setAccent = useCallback((next: string) => {
    accentSelectionRevision.current += 1;
    const persistence = appOperationCoordinator.runInPipeline(() =>
      setAppSetting(ACCENT_KEY, next).catch(() => {})
    );
    setAccentState(next);
    return persistence;
  }, []);

  const scheme: ThemeScheme =
    mode === 'system' ? (deviceScheme === 'light' ? 'light' : 'dark') : mode;

  const colors = useMemo(() => makeColors(scheme, accent), [scheme, accent]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    appOperationCoordinator
      .runInPipeline(async () => {
        await updateAppWidgetTheme(colors);
      })
      .catch((error) => {
        // Theme persistence in app_settings already succeeded (or is using the
        // saved value). A later foreground reconcile will retry surface output.
        console.warn('Widget theme update deferred', error);
      });
  }, [colors, isHydrated]);

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
