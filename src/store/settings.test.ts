import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

describe('settings', () => {
  it('round-trips through storage', () => {
    const s = memory();
    saveSettings(s, { ...DEFAULT_SETTINGS, excludedSources: ['pubmed'], limitPerSource: 50, aiLanguage: 'en', useLlm: false });
    expect(loadSettings(s)).toEqual({ ...DEFAULT_SETTINGS, excludedSources: ['pubmed'], limitPerSource: 50, aiLanguage: 'en', useLlm: false });
  });

  it('falls back to defaults for missing, broken or out-of-range values', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = memory();
    s.setItem('rmm:v1:settings', '{not json');
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    s.setItem('rmm:v1:settings', JSON.stringify({ limitPerSource: 999, aiLanguage: 'fr', useLlm: 'yes' }));
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });

  it('picks the UI language from the browser on first visit', () => {
    expect(loadSettings(null, ['en-US', 'ja']).uiLanguage).toBe('en');
    expect(loadSettings(null, ['fr-FR', 'ja-JP']).uiLanguage).toBe('ja');
    const s = memory();
    saveSettings(s, { ...DEFAULT_SETTINGS, uiLanguage: 'ja' });
    expect(loadSettings(s, ['en-US']).uiLanguage).toBe('ja');
  });
});
