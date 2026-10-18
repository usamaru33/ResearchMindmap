import { useState } from 'react';
import type { ExpandKind, ExpandResponse, Paper } from '../../../shared/types';
import { apiPost } from '../../api/client';
import { getYearColor, truncateAuthors } from '../../utils/helpers';
import { useT } from '../../hooks/useT';
import type { MessageKey } from '../../i18n';
import styles from './DetailPanel.module.css';

const KINDS: Array<{ kind: ExpandKind; label: MessageKey; hint: MessageKey }> = [
  { kind: 'references', label: 'expand.references', hint: 'expand.referencesHint' },
  { kind: 'citations', label: 'expand.citations', hint: 'expand.citationsHint' },
  { kind: 'related', label: 'expand.related', hint: 'expand.relatedHint' },
];
const PRESELECT = 8;

type Loaded = { kind: ExpandKind; response: ExpandResponse; selected: Set<string> };

interface ExpandSectionProps {
  paper: Paper;
  mapIds: Set<string>;
  onAdd: (papers: Paper[], kind: ExpandKind) => void;
}

export function ExpandSection({ paper, mapIds, onAdd }: ExpandSectionProps) {
  const t = useT();
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
      <div className={styles.sectionLabel}>{t('expand.title')}</div>
      <div className={styles.expandButtons}>
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            className={`${styles.expandBtn} ${loaded?.kind === k.kind ? styles.expandBtnActive : ''}`}
            onClick={() => load(k.kind)}
            disabled={loading !== null}
            title={t(k.hint)}
          >
            {loading === k.kind ? t('expand.loading') : t(k.label)}
          </button>
        ))}
      </div>
      {error && <div className={styles.errorNote}>{error}</div>}
      {loaded && (
        <div className={styles.expandList}>
          <div className={styles.expandHeader}>
            <span>
              {loaded.response.total > loaded.response.papers.length
                ? t('expand.countOf', { shown: loaded.response.papers.length, total: loaded.response.total })
                : t('expand.count', { shown: loaded.response.papers.length })}
              {' · '}
              {t('expand.selected', { n: loaded.selected.size })}
            </span>
            <button type="button" className={styles.refLink} onClick={() => setLoaded(null)}>
              {t('expand.close')}
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
                    aria-label={t('expand.select', { title: p.title })}
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
                      {p.citationCount !== undefined && ` · ${t('expand.cites', { n: p.citationCount.toLocaleString() })}`}
                      {inMap && ` · ${t('expand.inMap')}`}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {loaded.response.papers.length > 0 && (
            <button type="button" className={styles.editBtn} onClick={add} disabled={loaded.selected.size === 0}>
              {t('expand.add', { n: loaded.selected.size })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
