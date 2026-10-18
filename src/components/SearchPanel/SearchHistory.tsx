import { useState } from 'react';
import type { HistoryEntry } from '../../types';
import { useT } from '../../hooks/useT';
import styles from './SearchPanel.module.css';

interface SearchHistoryProps {
  entries: HistoryEntry[];
  onUse: (entry: HistoryEntry) => void;
  onRerun: (entry: HistoryEntry) => void;
  onPin: (id: string) => void;
  onRemove: (id: string) => void;
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function SearchHistory({ entries, onUse, onRerun, onPin, onRemove }: SearchHistoryProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
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
        <button type="button" className={styles.linkBtn} onClick={() => setOpen((v) => !v)}>
          {open ? t('history.hide') : t('history.showAll', { n: entries.length })}
        </button>
      </div>
      {shown.length > 0 && (
        <ul className={styles.historyList}>
          {shown.map((e) => (
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
              </span>
              <button type="button" className={styles.linkBtn} onClick={() => onRerun(e)}>
                {t('history.run')}
              </button>
              <button type="button" className={styles.linkBtn} onClick={() => onRemove(e.id)} aria-label={t('history.remove')}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
