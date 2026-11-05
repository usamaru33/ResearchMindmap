import { useCallback, useEffect, useRef, useState } from 'react';
import { tr } from '../i18n/current';
import type { ProjectSummary } from '../store/projects';
import { DriveError, createDrive } from '../sync/drive';
import { SignInError, fetchAccount, requestToken, revokeToken, type Token } from '../sync/google';
import { runSync, type SyncResult } from '../sync/run';
import { loadSyncState, saveSyncState, stateForAccount, type SyncState, EMPTY_SYNC_STATE } from '../sync/state';
import { browserStorage, projectStore } from './useProjects';

/** Wait this long after the last save before syncing on its own. */
const AUTO_SYNC_MS = 10_000;
/** A token this close to its end is treated as already expired. */
const EXPIRY_MARGIN_MS = 30_000;

export type SyncStatus = 'signedOut' | 'signingIn' | 'idle' | 'syncing' | 'expired';

export interface SyncMessage {
  kind: 'ok' | 'error';
  text: string;
}

export interface GoogleSync {
  /** Whether the server has a Google client ID; the UI is hidden without one. */
  available: boolean;
  status: SyncStatus;
  email: string | null;
  lastSyncAt: string | null;
  message: SyncMessage | null;
  signIn: () => void;
  signOut: () => void;
  syncNow: () => void;
}

export function describeSyncResult(r: SyncResult): string {
  const parts: string[] = [];
  const moved = r.uploaded + r.downloaded + r.deleted;
  parts.push(moved === 0 && r.conflicts === 0 ? tr('sync.upToDate') : tr('sync.summary', { up: r.uploaded, down: r.downloaded, del: r.deleted }));
  if (r.conflicts) parts.push(tr('sync.conflicts', { n: r.conflicts }));
  if (r.skipped) parts.push(tr('sync.skipped', { n: r.skipped }));
  if (r.unreadable) parts.push(tr('sync.unreadable', { n: r.unreadable }));
  return parts.join('。');
}

function describeError(err: unknown): string {
  if (err instanceof SignInError) {
    if (err.code === 'script') return tr('sync.err.script');
    if (err.code === 'popup') return tr('sync.err.popup');
    if (err.code === 'scope') return tr('sync.err.scope');
    return tr('sync.err.denied', { reason: err.message });
  }
  if (err instanceof DriveError) {
    if (err.kind === 'quota') return tr('sync.err.quota');
    if (err.kind === 'network') return tr('sync.err.network');
    return tr('sync.err.http', { status: err.status });
  }
  return err instanceof Error ? err.message : String(err);
}

const listKey = (list: ProjectSummary[]) => list.map((p) => `${p.id}:${p.updatedAt}`).join('|');

interface Options {
  clientId: string | null;
  /** Projects as the editor lists them; a change after a sync starts the next automatic one. */
  projects: ProjectSummary[];
  /** Write the open map to storage now, so a sync sees the latest edit. */
  flush: () => void;
  /** Called after a sync changed what is stored here. */
  onChanged: () => void;
}

export function useGoogleSync({ clientId, projects, flush, onChanged }: Options): GoogleSync {
  const [status, setStatus] = useState<SyncStatus>('signedOut');
  const [email, setEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<SyncMessage | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => loadSyncState(browserStorage()).lastSyncAt);
  const token = useRef<Token | null>(null);
  const state = useRef<SyncState>(EMPTY_SYNC_STATE);
  const running = useRef(false);
  // The list as it was when the last sync ended: only a later change starts an automatic sync.
  const syncedKey = useRef<string | null>(null);
  // Latest callbacks, so `sync` itself can stay stable.
  const latest = useRef({ flush, onChanged });
  useEffect(() => {
    latest.current = { flush, onChanged };
  });

  const sync = useCallback(async () => {
    if (running.current) return;
    const t = token.current;
    if (!t || Date.now() > t.expiresAt - EXPIRY_MARGIN_MS) {
      token.current = null;
      setStatus('expired');
      return;
    }
    running.current = true;
    setStatus('syncing');
    try {
      latest.current.flush();
      const res = await runSync(projectStore, createDrive(() => t.accessToken), state.current.base);
      state.current = { ...state.current, base: res.base, lastSyncAt: new Date().toISOString() };
      saveSyncState(browserStorage(), state.current);
      setLastSyncAt(state.current.lastSyncAt);
      if (res.changed.length) latest.current.onChanged();
      syncedKey.current = listKey(projectStore.list());
      setMessage({ kind: 'ok', text: describeSyncResult(res) });
      setStatus('idle');
    } catch (err) {
      if (err instanceof DriveError && err.kind === 'auth') {
        token.current = null;
        setMessage(null);
        setStatus('expired');
      } else {
        setMessage({ kind: 'error', text: describeError(err) });
        setStatus('idle');
      }
    } finally {
      running.current = false;
    }
  }, []);

  const signIn = useCallback(() => {
    if (!clientId) return;
    setStatus('signingIn');
    setMessage(null);
    void (async () => {
      try {
        const t = await requestToken(clientId);
        const account = await fetchAccount(t.accessToken);
        token.current = t;
        state.current = stateForAccount(loadSyncState(browserStorage()), account.id);
        setLastSyncAt(state.current.lastSyncAt);
        setEmail(account.email);
        await sync();
      } catch (err) {
        token.current = null;
        setMessage({ kind: 'error', text: describeError(err) });
        setStatus('signedOut');
      }
    })();
  }, [clientId, sync]);

  const signOut = useCallback(() => {
    if (token.current) revokeToken(token.current.accessToken);
    token.current = null;
    syncedKey.current = null;
    setEmail(null);
    setMessage(null);
    setStatus('signedOut');
  }, []);

  // Sync again a little after the projects change, while signed in.
  const key = listKey(projects);
  useEffect(() => {
    if (status !== 'idle' || key === syncedKey.current) return;
    const timer = window.setTimeout(() => void sync(), AUTO_SYNC_MS);
    return () => window.clearTimeout(timer);
  }, [status, key, sync]);

  return {
    available: !!clientId,
    status,
    email,
    lastSyncAt,
    message,
    signIn,
    signOut,
    syncNow: () => void sync(),
  };
}
