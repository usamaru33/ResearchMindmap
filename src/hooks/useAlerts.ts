import { useCallback, useEffect, useRef, useState } from 'react';
import type { SearchResponse } from '../../shared/types';
import { apiPost } from '../api/client';
import { alertQuery, dueForCheck, mergeSeen, seenKeys, unseenPapers, watchedEntries } from '../store/alerts';
import type { UndoAction } from '../store/undo';
import type { HistoryEntry, Paper } from '../types';
import { useSettings } from './settingsContext';

export interface AlertsState {
  /** New papers per saved search, from the latest check in this session. */
  found: Record<string, Paper[]>;
  checking: boolean;
  check: () => void;
  markSeen: (entryId: string) => void;
}

/**
 * New-paper alerts for saved (pinned) query searches. There is no background
 * scheduler: searches are checked when a project opens (at most once a day each,
 * if enabled in settings) or when the user asks.
 */
export function useAlerts(projectId: string, history: HistoryEntry[], dispatch: (a: UndoAction) => void): AlertsState {
  const { settings } = useSettings();
  const [found, setFound] = useState<Record<string, Paper[]>>({});
  const [checking, setChecking] = useState(false);
  // Callbacks read the latest history without re-creating themselves on every change.
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const run = useCallback(
    async (entries: HistoryEntry[]) => {
      if (entries.length === 0) return;
      setChecking(true);
      for (const e of entries) {
        const now = new Date();
        const res = await apiPost<SearchResponse>('/api/search', {
          query: alertQuery(e.text, now),
          limitPerSource: settings.limitPerSource,
        }).catch(() => null);
        if (!res) continue;
        if (!e.seen) {
          // Saved before alerts existed: today's results become the baseline.
          dispatch({ type: 'UPDATE_HISTORY', payload: { id: e.id, patch: { seen: seenKeys(res.results), checkedAt: now.toISOString() } } });
          continue;
        }
        const fresh = unseenPapers(res.results, e.seen);
        setFound((f) => ({ ...f, [e.id]: fresh }));
        dispatch({ type: 'UPDATE_HISTORY', payload: { id: e.id, patch: { checkedAt: now.toISOString() } } });
      }
      setChecking(false);
    },
    [dispatch, settings.limitPerSource],
  );

  const check = useCallback(() => void run(watchedEntries(historyRef.current)), [run]);

  const markSeen = useCallback(
    (entryId: string) => {
      const entry = historyRef.current.find((h) => h.id === entryId);
      const papers = found[entryId] ?? [];
      if (entry) dispatch({ type: 'UPDATE_HISTORY', payload: { id: entryId, patch: { seen: mergeSeen(entry.seen, seenKeys(papers)) } } });
      setFound((f) => {
        const next = { ...f };
        delete next[entryId];
        return next;
      });
    },
    [dispatch, found],
  );

  // Once per opened project, check the saved searches that are due.
  const autoChecked = useRef<string | null>(null);
  useEffect(() => {
    if (!settings.autoCheckAlerts || autoChecked.current === projectId) return;
    autoChecked.current = projectId;
    // Wait a moment so the opened project's history is in place and the first paint is not slowed.
    const timer = window.setTimeout(() => {
      void run(watchedEntries(historyRef.current).filter((e) => dueForCheck(e, new Date())));
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [projectId, settings.autoCheckAlerts, run]);

  return { found, checking, check, markSeen };
}
