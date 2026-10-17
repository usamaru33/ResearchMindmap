import { createContext, useContext } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../store/settings';

export interface SettingsValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export const SettingsContext = createContext<SettingsValue>({ settings: DEFAULT_SETTINGS, update: () => {} });

export function useSettings(): SettingsValue {
  return useContext(SettingsContext);
}
