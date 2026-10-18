import { useMemo, useState } from 'react';
import type { CheckInput, CheckResponse, Paper } from '../../../shared/types';
import { apiPost } from '../../api/client';
import { useT } from '../../hooks/useT';
import { MISSING_FIELDS, findDuplicates, isPreprint, missingFields, publishedPatch, richness, type MissingField } from '../../store/libraryCheck';
import { truncateAuthors } from '../../utils/helpers';
import type { MessageKey } from '../../i18n';
import styles from './Library.module.css';

interface LibraryCheckProps {
  papers: Paper[];
  onFocus: (id: string) => void;
  onUpdate: (ids: string[], patch: (paper: Paper) => Partial<Paper>) => void;
  onDelete: (ids: string[]) => void;
  onMerge: (keepId: string, mergeIds: string[]) => void;
}

const FIELD_LABEL: Record<MissingField, MessageKey> = {
  year: 'check.field.year',
  authors: 'check.field.authors',
  venue: 'check.field.venue',
  abstract: 'check.field.abstract',
  doi: 'check.field.doi',
};

export const RETRACTED_TAG = 'retracted';

function toInput(p: Paper): CheckInput {
  return {
    id: p.id,
    title: p.title,
    year: p.year,
    venue: p.venue,
    type: p.type,
    authors: p.authors.slice(0, 3),
    ids: { doi: p.ids?.doi, arxiv: p.ids?.arxiv, openalex: p.ids?.openalex },
  };
}

/** Retractions, published versions of preprints, duplicates and missing metadata. */
export function LibraryCheck({ papers, onFocus, onUpdate, onDelete, onMerge }: LibraryCheckProps) {
  const t = useT();
  const [remote, setRemote] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<MissingField | null>(null);
  const [keep, setKeep] = useState<Record<string, string>>({});

  const duplicates = useMemo(() => findDuplicates(papers), [papers]);
  const missing = useMemo(() => {
    const by = new Map<MissingField, Paper[]>(MISSING_FIELDS.map((f) => [f, []]));
    for (const p of papers) for (const f of missingFields(p)) by.get(f)!.push(p);
    return by;
  }, [papers]);
  const byId = useMemo(() => new Map(papers.map((p) => [p.id, p])), [papers]);
  const retracted = (remote?.retracted ?? []).map((id) => byId.get(id)).filter((p): p is Paper => !!p);
  // A replaced preprint is no longer a preprint and drops off the list.
  const published = Object.entries(remote?.published ?? {})
    .map(([id, version]) => ({ paper: byId.get(id), version }))
    .filter((x): x is { paper: Paper; version: Paper } => !!x.paper && isPreprint(x.paper));

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setRemote(await apiPost<CheckResponse>('/api/papers/check', { papers: papers.slice(0, 300).map(toInput) }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const replace = (items: Array<{ paper: Paper; version: Paper }>) => {
    for (const { paper, version } of items) onUpdate([paper.id], () => publishedPatch(paper, version));
  };

  const groupKey = (g: Paper[]) => g.map((p) => p.id).join('|');
  const keptOf = (g: Paper[]) => keep[groupKey(g)] ?? [...g].sort((a, b) => richness(b) - richness(a))[0].id;
  const nothingLocal = duplicates.length === 0 && [...missing.values()].every((l) => l.length === 0);

  return (
    <div className={styles.check}>
      <section className={styles.checkSection}>
        <div className={styles.checkHeader}>
          <h4>{t('check.remote')}</h4>
          <button type="button" className={styles.bulkBtn} onClick={run} disabled={loading || papers.length === 0}>
            {loading ? t('check.checking') : remote ? t('check.again') : t('check.run')}
          </button>
        </div>
        <p className={styles.meta}>{t('check.remoteHint')}</p>
        {papers.length > 300 && <p className={styles.meta}>{t('check.first300')}</p>}
        {error && <p className={styles.checkError}>{error}</p>}
        {remote && (
          <p className={styles.meta}>
            {t('check.done', { n: remote.checked.retraction, preprints: remote.checked.preprints })}
            {remote.checked.preprintTotal > remote.checked.preprints && ` ${t('check.preprintCap', { n: remote.checked.preprints, total: remote.checked.preprintTotal })}`}
            {remote.failed.map((f) => ` ${t(f === 'retraction' ? 'check.failedRetraction' : 'check.failedPublished')}`).join('')}
          </p>
        )}

        {remote && retracted.length === 0 && published.length === 0 && <p className={styles.checkOk}>{t('check.remoteOk')}</p>}

        {retracted.length > 0 && (
          <div className={styles.checkGroup}>
            <h5 className={styles.checkWarn}>{t('check.retracted', { n: retracted.length })}</h5>
            <ul className={styles.checkList}>
              {retracted.map((p) => (
                <li key={p.id}>
                  <button type="button" className={styles.checkTitle} onClick={() => onFocus(p.id)}>
                    {p.year || '—'} · {p.title}
                  </button>
                  <span className={styles.checkActions}>
                    <button
                      type="button"
                      className={styles.bulkBtn}
                      disabled={p.tags?.includes(RETRACTED_TAG)}
                      onClick={() => onUpdate([p.id], (x) => ({ tags: [...new Set([...(x.tags ?? []), RETRACTED_TAG])] }))}
                    >
                      {p.tags?.includes(RETRACTED_TAG) ? t('check.tagged') : t('check.tagRetracted')}
                    </button>
                    <button type="button" className={`${styles.bulkBtn} ${styles.danger}`} onClick={() => onDelete([p.id])}>
                      {t('library.delete')}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {published.length > 0 && (
          <div className={styles.checkGroup}>
            <div className={styles.checkHeader}>
              <h5>{t('check.published', { n: published.length })}</h5>
              {published.length > 1 && (
                <button type="button" className={styles.bulkBtn} onClick={() => replace(published)}>
                  {t('check.replaceAll')}
                </button>
              )}
            </div>
            <ul className={styles.checkList}>
              {published.map(({ paper, version }) => (
                <li key={paper.id}>
                  <button type="button" className={styles.checkTitle} onClick={() => onFocus(paper.id)}>
                    {paper.title}
                  </button>
                  <span className={styles.meta}>
                    {paper.venue || 'arXiv'} {paper.year || ''} → <strong>{version.venue || version.publisher}</strong> {version.year || ''}
                    {version.ids?.doi && ` · ${version.ids.doi}`}
                  </span>
                  <span className={styles.checkActions}>
                    <button type="button" className={styles.bulkBtn} onClick={() => replace([{ paper, version }])}>
                      {t('check.replace')}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <p className={styles.meta}>{t('check.replaceHint')}</p>
          </div>
        )}
      </section>

      <section className={styles.checkSection}>
        <h4>{t('check.local')}</h4>
        {nothingLocal && <p className={styles.checkOk}>{t('check.localOk')}</p>}

        {duplicates.length > 0 && (
          <div className={styles.checkGroup}>
            <h5 className={styles.checkWarn}>{t('check.duplicates', { n: duplicates.length })}</h5>
            {duplicates.map((g) => {
              const kept = keptOf(g);
              return (
                <div key={groupKey(g)} className={styles.dupGroup}>
                  {g.map((p) => (
                    <label key={p.id} className={styles.dupItem}>
                      <input type="radio" name={groupKey(g)} checked={kept === p.id} onChange={() => setKeep({ ...keep, [groupKey(g)]: p.id })} />
                      <span>
                        <span className={styles.title}>
                          {p.year || '—'} · {p.title}
                        </span>
                        <span className={styles.meta}>
                          {[truncateAuthors(p.authors, 2), p.venue, p.ids?.doi ?? (p.ids?.arxiv && `arXiv:${p.ids.arxiv}`)].filter(Boolean).join(' · ')}
                          {p.notes ? ` · ${t('check.hasNotes')}` : ''}
                        </span>
                      </span>
                    </label>
                  ))}
                  <button type="button" className={styles.bulkBtn} onClick={() => onMerge(kept, g.map((p) => p.id))}>
                    {t('check.merge', { n: g.length })}
                  </button>
                </div>
              );
            })}
            <p className={styles.meta}>{t('check.mergeHint')}</p>
          </div>
        )}

        {[...missing.values()].some((l) => l.length > 0) && (
          <div className={styles.checkGroup}>
            <h5>{t('check.missing')}</h5>
            <div className={styles.chips}>
              {MISSING_FIELDS.filter((f) => missing.get(f)!.length > 0).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`${styles.bulkBtn} ${field === f ? styles.chipActive : ''}`}
                  aria-pressed={field === f}
                  onClick={() => setField(field === f ? null : f)}
                >
                  {t(FIELD_LABEL[f])} {missing.get(f)!.length}
                </button>
              ))}
            </div>
            {field && (
              <ul className={styles.checkList}>
                {missing.get(field)!.map((p) => (
                  <li key={p.id}>
                    <button type="button" className={styles.checkTitle} onClick={() => onFocus(p.id)}>
                      {p.year || '—'} · {p.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
