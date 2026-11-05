import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../store/projects';
import { loadSyncState, saveSyncState, stateForAccount } from './state';

function memory(initial?: string): KeyValueStorage {
  const data = new Map<string, string>(initial === undefined ? [] : [['rmm:v1:sync', initial]]);
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('sync state', () => {
  it('starts empty when nothing or garbage is stored', () => {
    for (const stored of [undefined, 'not json', 'null', '{"base":5}']) {
      expect(loadSyncState(memory(stored))).toEqual({ account: null, base: {}, lastSyncAt: null });
    }
  });

  it('round-trips, dropping entries that are not times', () => {
    const storage = memory();
    saveSyncState(storage, { account: 'g1', base: { a: 'T1' }, lastSyncAt: 'T2' });
    expect(loadSyncState(storage)).toEqual({ account: 'g1', base: { a: 'T1' }, lastSyncAt: 'T2' });
    expect(loadSyncState(memory('{"account":"g1","base":{"a":"T1","b":3},"lastSyncAt":7}'))).toEqual({ account: 'g1', base: { a: 'T1' }, lastSyncAt: null });
  });

  it('starts from nothing for another Google account, so its deletions are not mistaken for ours', () => {
    const state = { account: 'g1', base: { a: 'T1' }, lastSyncAt: 'T2' };
    expect(stateForAccount(state, 'g1')).toBe(state);
    expect(stateForAccount(state, 'g2')).toEqual({ account: 'g2', base: {}, lastSyncAt: null });
  });
});
