import { useState } from 'react';
import type { ExpandKind, ExpandResponse, Paper } from '../../../shared/types';
import { apiPost } from '../../api/client';
import { getYearColor, truncateAuthors } from '../../utils/helpers';
import styles from './DetailPanel.module.css';

const KINDS: Array<{ kind: ExpandKind; label: string; hint: string }> = [
  { kind: 'references', label: 'References', hint: 'この論文が引用している論文（過去へ）' },
  { kind: 'citations', label: 'Cited by', hint: 'この論文を引用している論文（未来へ）' },
  { kind: 'related', label: 'Related', hint: 'OpenAlex が近いと判断した論文' },
];
const PRESELECT = 8;

type Loaded = { kind: ExpandKind; response: ExpandResponse; selected: Set<string> };

interface ExpandSectionProps {
  paper: Paper;
  mapIds: Set<string>;
  onAdd: (papers: Paper[], kind: ExpandKind) => void;
}

export function ExpandSection({ paper, mapIds, onAdd }: ExpandSectionProps) {
  const [loading, setLoading] = useState<ExpandKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const load = async (kind: ExpandKind) => {
    setLoading(kind);
    setError(null);
    try {
      const response = await apiPost<ExpandResponse>('/api/papers/expand', { paper, kind, limit: 50 });
      const fresh = response.papers.filter((p) => !mapIds.has(p.id));
      setLoaded({ kind, response, selected: new Set(fresh.slice(0, PRESELECT).map((p) => p.id)) });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const toggle = (id: string) => {
    if (!loaded) return;
    const selected = new Set(loaded.selected);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    setLoaded({ ...loaded, selected });
  };

  const add = () => {
    if (!loaded) return;
    onAdd(
      loaded.response.papers.filter((p) => loaded.selected.has(p.id)),
      loaded.kind,
    );
    setLoaded(null);
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionLabel}>Explore</div>
      <div className={styles.expandButtons}>
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            className={`${styles.expandBtn} ${loaded?.kind === k.kind ? styles.expandBtnActive : ''}`}
            onClick={() => load(k.kind)}
            disabled={loading !== null}
            title={k.hint}
          >
            {loading === k.kind ? 'Loading…' : k.label}
          </button>
        ))}
      </div>
      {error && <div className={styles.errorNote}>{error}</div>}
      {loaded && (
        <div className={styles.expandList}>
          <div className={styles.expandHeader}>
            <span>
              {loaded.response.papers.length}
              {loaded.response.total > loaded.response.papers.length && ` / ${loaded.response.total}`} papers ·{' '}
              {loaded.selected.size} selected
            </span>
            <button type="button" className={styles.refLink} onClick={() => setLoaded(null)}>
              Close
            </button>
          </div>
          {loaded.response.warnings.map((w) => (
            <div key={w} className={styles.emptyNote}>
              {w}
            </div>
          ))}
          <ul className={styles.refList}>
            {loaded.response.papers.map((p) => {
              const inMap = mapIds.has(p.id);
              return (
                <li key={p.id} className={styles.expandItem}>
                  <input
                    type="checkbox"
                    checked={loaded.selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    aria-label={`Select ${p.title}`}
                  />
                  <div>
                    <div className={styles.expandTitle}>
                      <span className={styles.yearDot} style={{ background: getYearColor(p.year) }}>
                        {p.year || '—'}
                      </span>{' '}
                      {p.title}
                    </div>
                    <div className={styles.expandMeta}>
                      {truncateAuthors(p.authors, 2)}
                      {p.citationCount !== undefined && ` · ${p.citationCount.toLocaleString()} cites`}
                      {inMap && ' · in map'}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {loaded.response.papers.length > 0 && (
            <button type="button" className={styles.editBtn} onClick={add} disabled={loaded.selected.size === 0}>
              Add {loaded.selected.size} to map
            </button>
          )}
        </div>
      )}
    </div>
  );
}
