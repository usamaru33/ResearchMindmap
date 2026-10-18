import { useState } from 'react';
import type { HistoryEntry } from '../../types';
import type { AlertsState } from '../../hooks/useAlerts';
import { watchedEntries } from '../../store/alerts';
import { ResultsSection, type BuildMapHandler } from './ResultsSection';
import { useT } from '../../hooks/useT';
import styles from './SearchPanel.module.css';

interface SearchHistoryProps {
  entries: HistoryEntry[];
  onUse: (entry: HistoryEntry) => void;
  onRerun: (entry: HistoryEntry) => void;
  onPin: (id: string) => void;
  onRemove: (id: string) => void;
  alerts: AlertsState;
  mapIds: Set<string>;
  onBuildMap: BuildMapHandler;
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function SearchHistory({ entries, onUse, onRerun, onPin, onRemove, alerts, mapIds, onBuildMap }: SearchHistoryProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const watched = new Set(watchedEntries(entries).map((e) => e.id));
  const expandedEntry = entries.find((e) => e.id === expanded);
  const expandedFresh = expandedEntry ? alerts.found[expandedEntry.id] : undefined;
  if (entries.length === 0) return null;
  const pinned = entries.filter((e) => e.pinned);
  // Pinned (saved) searches are always visible; the rest on demand.
  const shown = open ? entries : pinned;

  return (
    <div className={styles.history}>
      <div className={styles.labelRow}>
        <span className={styles.label}>
          {t('history.title')}{pinned.length > 0 && ` · ★ ${pinned.length}`}
        </span>
        <span className={styles.resultsActions}>
          {watched.size > 0 && (
            <button type="button" className={styles.linkBtn} onClick={alerts.check} disabled={alerts.checking} title={t('alerts.checkTitle')}>
              {alerts.checking ? t('alerts.checking') : t('alerts.check')}
            </button>
          )}
          <button type="button" className={styles.linkBtn} onClick={() => setOpen((v) => !v)}>
            {open ? t('history.hide') : t('history.showAll', { n: entries.length })}
          </button>
        </span>
      </div>
      {shown.length > 0 && (
        <ul className={styles.historyList}>
          {shown.map((e) => {
            const fresh = alerts.found[e.id];
            return (
              <li key={e.id} className={styles.historyItem}>
                <button
                  type="button"
                  className={`${styles.pin} ${e.pinned ? styles.pinOn : ''}`}
                  onClick={() => onPin(e.id)}
                  aria-label={e.pinned ? t('history.unpin') : t('history.pin')}
                  title={e.pinned ? t('history.unpin') : t('history.pin')}
                >
                  ★
                </button>
                <button type="button" className={styles.historyText} onClick={() => onUse(e)} title={t('history.use')}>
                  <span className={styles.historyKind}>{e.kind === 'vague' ? t('history.vague') : t('history.query')}</span>
                  {e.text}
                </button>
                <span className={styles.historyMeta}>
                  {e.resultCount} · {when(e.at)}
                  {watched.has(e.id) && e.checkedAt && (
                    <span title={t('alerts.checkedAt', { when: when(e.checkedAt) })}>
                      {' · '}
                      {fresh && fresh.length > 0 ? (
                        <button type="button" className={styles.alertBadge} onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                          {t('alerts.new', { n: fresh.length })}
                        </button>
                      ) : fresh ? (
                        t('alerts.none')
                      ) : null}
                    </span>
                  )}
                </span>
                <button type="button" className={styles.linkBtn} onClick={() => onRerun(e)}>
                  {t('history.run')}
                </button>
                <button type="button" className={styles.linkBtn} onClick={() => onRemove(e.id)} aria-label={t('history.remove')}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {expandedEntry && expandedFresh && expandedFresh.length > 0 && (
        <div className={styles.alertResults}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => {
              alerts.markSeen(expandedEntry.id);
              setExpanded(null);
            }}
          >
            {t('alerts.markSeen')}
          </button>
          <ResultsSection
            results={expandedFresh}
            mapIds={mapIds}
            query={t('alerts.rootQuery', { query: expandedEntry.text })}
            mode="query"
            defaultTarget="current"
            onBuildMap={onBuildMap}
          />
        </div>
      )}
    </div>
  );
}
