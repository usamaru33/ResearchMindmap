import { useMemo, useState } from 'react';
import type { MissingCandidate, MissingResponse } from '../../../shared/types';
import type { Paper } from '../../types';
import { apiPost } from '../../api/client';
import { coveragePercent, linksFor, missingSeeds, signalsOf, visibleCandidates, type MissingSignal } from '../../store/missing';
import { truncateAuthors } from '../../utils/helpers';
import { useT } from '../../hooks/useT';
import type { MessageKey } from '../../i18n';
import styles from './Missing.module.css';

interface MissingViewProps {
  papers: Paper[];
  onFocusPaper: (id: string) => void;
  /** Add the chosen works and the citations tying them to the map. */
  onAdd: (papers: Paper[], links: Array<[string, string]>) => void;
}

const SIGNALS: Array<[MissingSignal, MessageKey]> = [
  ['foundation', 'missing.signal.foundation'],
  ['followUp', 'missing.signal.followUp'],
  ['cocited', 'missing.signal.cocited'],
];

/** Important works the map lacks, with the map papers that point to them (DESIGN 15.1). */
export function MissingView({ papers, onFocusPaper, onAdd }: MissingViewProps) {
  const t = useT();
  const seeds = useMemo(() => missingSeeds(papers), [papers]);
  const titleOf = useMemo(() => new Map(papers.map((p) => [p.id, p.title])), [papers]);
  const [result, setResult] = useState<MissingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signal, setSignal] = useState<MissingSignal | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await apiPost<MissingResponse>('/api/papers/missing', { papers: seeds }));
      setChosen(new Set());
      setSignal(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const all = useMemo(() => (result ? visibleCandidates(result.candidates, papers) : []), [result, papers]);
  const shown = signal ? all.filter((c) => signalsOf(c).includes(signal)) : all;
  const picked = all.filter((c) => chosen.has(c.paper.id));
  const pct = result ? coveragePercent(result.coverage) : null;

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const add = () => {
    onAdd(
      picked.map((c) => c.paper),
      linksFor(picked),
    );
    setChosen(new Set());
  };

  const reasons = (c: MissingCandidate) => {
    const out: Array<{ key: string; text: string; evidence?: string[] }> = [];
    if (c.citedBy.length) out.push({ key: 'by', text: t('missing.citedBy', { n: c.citedBy.length }), evidence: c.citedBy });
    if (c.cites.length) out.push({ key: 'cites', text: t('missing.cites', { n: c.cites.length }), evidence: c.cites });
    if (c.cocited) out.push({ key: 'co', text: t('missing.cocited', { n: c.cocited }) });
    return out;
  };

  return (
    <div className={styles.view}>
      <p className={styles.note}>{t('missing.hint')}</p>
      <div className={styles.runRow}>
        <span className={styles.note}>{t('missing.seeds', { n: seeds.length, total: papers.length })}</span>
        <button type="button" className={styles.primary} onClick={run} disabled={loading || seeds.length === 0}>
          {loading ? t('missing.loading') : result ? t('missing.rerun') : t('missing.run')}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}

      {result && (
        <>
          <section className={styles.coverage} aria-label={t('missing.coverageLabel')}>
            <div className={styles.coverageHead}>
              <span className={styles.coverageValue}>{pct === null ? '—' : `${pct}%`}</span>
              <span>{t('missing.coverageTitle')}</span>
            </div>
            {pct !== null && (
              <div className={styles.bar} role="img" aria-label={`${pct}%`}>
                <span style={{ width: `${pct}%` }} />
              </div>
            )}
            <p className={styles.note}>
              {result.coverage.total
                ? t('missing.coverage', { threshold: result.coverage.threshold, total: result.coverage.total, inMap: result.coverage.inMap })
                : t('missing.coverageNone')}
            </p>
            {result.failed.includes('forward') && <p className={styles.error}>{t('missing.forwardFailed')}</p>}
          </section>

          <div className={styles.filters} role="group" aria-label={t('missing.filterLabel')}>
            <button type="button" aria-pressed={signal === null} onClick={() => setSignal(null)}>
              {t('missing.all', { n: all.length })}
            </button>
            {SIGNALS.map(([s, label]) => (
              <button key={s} type="button" aria-pressed={signal === s} onClick={() => setSignal(signal === s ? null : s)} title={t(`${label}.hint` as MessageKey)}>
                {t(label)} {all.filter((c) => signalsOf(c).includes(s)).length}
              </button>
            ))}
          </div>

          <div className={styles.addBar}>
            <span className={styles.note}>{t('missing.chosen', { n: picked.length })}</span>
            <button type="button" className={styles.primary} onClick={add} disabled={picked.length === 0}>
              {t('missing.add', { n: picked.length })}
            </button>
          </div>

          {shown.length === 0 ? (
            <p className={styles.note}>{all.length ? t('missing.noneHere') : t('missing.none')}</p>
          ) : (
            <ul className={styles.list}>
              {shown.map((c) => {
                const p = c.paper;
                return (
                  <li key={p.id} className={styles.item}>
                    <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} aria-label={t('missing.choose', { title: p.title })} />
                    <div className={styles.body}>
                      <span className={styles.title}>{p.title}</span>
                      <span className={styles.meta}>
                        {[p.year || null, truncateAuthors(p.authors, 3), p.venue, p.citationCount !== undefined ? t('missing.citations', { n: p.citationCount }) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <div className={styles.reasons}>
                        {reasons(c).map((r) =>
                          r.evidence ? (
                            <button
                              key={r.key}
                              type="button"
                              className={styles.reason}
                              aria-expanded={open === `${p.id}:${r.key}`}
                              onClick={() => setOpen(open === `${p.id}:${r.key}` ? null : `${p.id}:${r.key}`)}
                            >
                              {r.text}
                            </button>
                          ) : (
                            <span key={r.key} className={`${styles.reason} ${styles.reasonPlain}`} title={t('missing.signal.cocited.hint')}>
                              {r.text}
                            </span>
                          ),
                        )}
                      </div>
                      {reasons(c)
                        .filter((r) => r.evidence && open === `${p.id}:${r.key}`)
                        .map((r) => (
                          <ul key={r.key} className={styles.evidence}>
                            {r.evidence!.map((id) => (
                              <li key={id}>
                                <button type="button" onClick={() => onFocusPaper(id)}>
                                  {titleOf.get(id) ?? id}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className={styles.note}>{t('missing.footer', { seeds: result.seeds, citing: result.citingWorks })}</p>
        </>
      )}
    </div>
  );
}
