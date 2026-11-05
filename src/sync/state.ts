import type { KeyValueStorage } from '../store/projects';
import type { SyncBase } from './plan';

const KEY = 'rmm:v1:sync';

/** What this device remembers between syncs. Not the sign-in: that is never stored. */
export interface SyncState {
  /** Google account the record belongs to; another account starts from nothing. */
  account: string | null;
  base: SyncBase;
  lastSyncAt: string | null;
}

export const EMPTY_SYNC_STATE: SyncState = { account: null, base: {}, lastSyncAt: null };

export function loadSyncState(storage: KeyValueStorage): SyncState {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? 'null') as Partial<SyncState> | null;
    if (!raw || typeof raw !== 'object' || !raw.base || typeof raw.base !== 'object') return { ...EMPTY_SYNC_STATE, base: {} };
    const base: SyncBase = {};
    for (const [id, at] of Object.entries(raw.base)) if (typeof at === 'string') base[id] = at;
    return {
      account: typeof raw.account === 'string' ? raw.account : null,
      base,
      lastSyncAt: typeof raw.lastSyncAt === 'string' ? raw.lastSyncAt : null,
    };
  } catch {
    return { ...EMPTY_SYNC_STATE, base: {} };
  }
}

export function saveSyncState(storage: KeyValueStorage, state: SyncState): void {
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the next sync starts from an empty record, which only costs a few extra copies.
  }
}

/** The record to use for `account`: kept for the same account, empty for another. */
export function stateForAccount(state: SyncState, account: string): SyncState {
  return state.account === account ? state : { account, base: {}, lastSyncAt: null };
}
