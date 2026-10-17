import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { loadSettings, saveSettings, type Settings } from '../store/settings';
import { SettingsContext } from './settingsContext';

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings(storage()));
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(storage(), next);
      return next;
    });
  }, []);
  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
