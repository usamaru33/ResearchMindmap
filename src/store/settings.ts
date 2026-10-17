import type { SourceName } from '../../shared/types';
import type { KeyValueStorage } from './projects';

export interface Settings {
  /** Databases turned off by default in query search. */
  excludedSources: SourceName[];
  limitPerSource: number;
  vagueLimit: number;
  /** Use Claude when a key is configured. */
  useLlm: boolean;
  /** Language of AI-written text (summaries, drafts, reasons). */
  aiLanguage: 'ja' | 'en';
}

export const DEFAULT_SETTINGS: Settings = {
  excludedSources: [],
  limitPerSource: 25,
  vagueLimit: 40,
  useLlm: true,
  aiLanguage: 'ja',
};

const KEY = 'rmm:v1:settings';
const LIMITS = [10, 25, 50];
const VAGUE_LIMITS = [20, 40, 60, 100];

/** Read settings, ignoring anything malformed or out of range. */
export function loadSettings(storage: KeyValueStorage | null): Settings {
  let raw: Partial<Settings> = {};
  try {
    raw = JSON.parse(storage?.getItem(KEY) ?? '{}') ?? {};
  } catch {
    raw = {};
  }
  return {
    excludedSources: Array.isArray(raw.excludedSources) ? raw.excludedSources.filter((s): s is SourceName => typeof s === 'string') : [],
    limitPerSource: LIMITS.includes(raw.limitPerSource as number) ? (raw.limitPerSource as number) : DEFAULT_SETTINGS.limitPerSource,
    vagueLimit: VAGUE_LIMITS.includes(raw.vagueLimit as number) ? (raw.vagueLimit as number) : DEFAULT_SETTINGS.vagueLimit,
    useLlm: typeof raw.useLlm === 'boolean' ? raw.useLlm : DEFAULT_SETTINGS.useLlm,
    aiLanguage: raw.aiLanguage === 'en' ? 'en' : 'ja',
  };
}

export function saveSettings(storage: KeyValueStorage | null, settings: Settings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Settings are a convenience; failing to persist them is not fatal.
  }
}

export { LIMITS as SOURCE_LIMIT_OPTIONS, VAGUE_LIMITS as VAGUE_LIMIT_OPTIONS };
