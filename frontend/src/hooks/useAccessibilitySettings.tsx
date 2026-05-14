import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_SHORTCUTS,
  type ShortcutActionId,
  type ShortcutMap,
  type ShortcutSpec,
  normalizeShortcut,
} from './accessibilityConfig';

type AccessibilitySettings = {
  conciseMode: boolean;
  shortcuts: ShortcutMap;
  onboardingSeen: boolean;
};

type AccessibilityApi = AccessibilitySettings & {
  setConciseMode: (value: boolean) => void;
  setOnboardingSeen: (value: boolean) => void;
  setShortcut: (actionId: ShortcutActionId, value: ShortcutSpec) => void;
  resetShortcuts: () => void;
};

const STORAGE_KEY = 'finto_accessibility_settings';

const DEFAULT_SETTINGS: AccessibilitySettings = {
  conciseMode: false,
  shortcuts: DEFAULT_SHORTCUTS,
  onboardingSeen: false,
};

const AccessibilityContext = createContext<AccessibilityApi | null>(null);

function loadInitialSettings(): AccessibilitySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AccessibilitySettings>;
    const shortcutOverrides = parsed.shortcuts ?? {};
    const mergedShortcuts = { ...DEFAULT_SHORTCUTS };
    (Object.keys(DEFAULT_SHORTCUTS) as ShortcutActionId[]).forEach((actionId) => {
      const override = shortcutOverrides[actionId];
      if (override) mergedShortcuts[actionId] = normalizeShortcut(override);
    });
    return {
      conciseMode: !!parsed.conciseMode,
      onboardingSeen: !!parsed.onboardingSeen,
      shortcuts: mergedShortcuts,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function AccessibilitySettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(loadInitialSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const setConciseMode = useCallback((value: boolean) => {
    setSettings((prev) => ({ ...prev, conciseMode: value }));
  }, []);

  const setOnboardingSeen = useCallback((value: boolean) => {
    setSettings((prev) => ({ ...prev, onboardingSeen: value }));
  }, []);

  const setShortcut = useCallback((actionId: ShortcutActionId, value: ShortcutSpec) => {
    setSettings((prev) => ({
      ...prev,
      shortcuts: {
        ...prev.shortcuts,
        [actionId]: normalizeShortcut(value),
      },
    }));
  }, []);

  const resetShortcuts = useCallback(() => {
    setSettings((prev) => ({ ...prev, shortcuts: DEFAULT_SHORTCUTS }));
  }, []);

  const value = useMemo<AccessibilityApi>(
    () => ({
      conciseMode: settings.conciseMode,
      shortcuts: settings.shortcuts,
      onboardingSeen: settings.onboardingSeen,
      setConciseMode,
      setOnboardingSeen,
      setShortcut,
      resetShortcuts,
    }),
    [settings, setConciseMode, setOnboardingSeen, setShortcut, resetShortcuts],
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibilitySettings(): AccessibilityApi {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) {
    return {
      conciseMode: false,
      shortcuts: DEFAULT_SHORTCUTS,
      onboardingSeen: false,
      setConciseMode: () => {},
      setOnboardingSeen: () => {},
      setShortcut: () => {},
      resetShortcuts: () => {},
    };
  }
  return ctx;
}
