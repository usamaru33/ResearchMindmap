import { useEffect, useMemo, useRef, useState } from 'react';
import type { Screening } from '../../../shared/types';
import type { Paper } from '../../types';
import {
  EXCLUSION_REASONS,
  matchesFilter,
  prismaCounts,
  prismaMarkdown,
  screeningQueue,
  type PrismaCounts,
  type ScreenFilter,
} from '../../store/screening';
import { truncateAuthors } from '../../utils/helpers';
import { useT } from '../../hooks/useT';
import type { MessageKey } from '../../i18n';
import styles from './ScreeningPanel.module.css';

interface ScreeningPanelProps {
  papers: Paper[];
  onDecide: (id: string, screening: Screening | undefined) => void;
  onFocusPaper: (id: string) => void;
}

type Decision = Screening['decision'];

const STAT_CARDS: Array<{ filter: ScreenFilter; label: MessageKey; count: (c: PrismaCounts) => number }> = [
  { filter: 'pending', label: 'screen.pending', count: (c) => c.pending },
  { filter: 'include', label: 'screen.include', count: (c) => c.included },
  { filter: 'maybe', label: 'screen.maybe', count: (c) => c.maybe },
  { filter: 'exclude', label: 'screen.exclude', count: (c) => c.excluded },
];

const FILTER_LABELS: Record<ScreenFilter, MessageKey> = {
  todo: 'screen.filter.todo',
  pending: 'screen.pending',
  include: 'screen.include',
  maybe: 'screen.maybe',
  exclude: 'screen.exclude',
  all: 'screen.filter.all',
};

export function ScreeningPanel({ papers, onDecide, onFocusPaper }: ScreeningPanelProps) {
  const t = useT();
  const reasons = EXCLUSION_REASONS[t.lang];
  const counts = useMemo(() => prismaCounts(papers), [papers]);
  const byId = useMemo(() => new Map(papers.map((p) => [p.id, p])), [papers]);
  // The list is fixed when a filter is chosen, so deciding a paper does not make it jump away mid-session.
  const [view, setView] = useState<{ filter: ScreenFilter; ids: string[] }>(() => ({
    filter: 'todo',
    ids: screeningQueue(papers)
      .filter((p) => matchesFilter(p, 'todo'))
      .map((p) => p.id),
  }));
  const queue = view.ids.filter((id) => byId.has(id));
  const [index, setIndex] = useState(0);
  const [reason, setReason] = useState('');
  const [copied, setCopied] = useState(false);
  const at = Math.min(index, Math.max(queue.length - 1, 0));
  const current = byId.get(queue[at]);
  const listRef = useRef<HTMLOListElement>(null);

  const chooseFilter = (filter: ScreenFilter) => {
    const next = view.filter === filter && filter !== 'todo' ? 'todo' : filter;
    setView({ filter: next, ids: screeningQueue(papers).filter((p) => matchesFilter(p, next)).map((p) => p.id) });
    setIndex(0);
    setReason('');
  };
  const go = (i: number) => {
    setIndex(Math.max(0, Math.min(i, queue.length - 1)));
    setReason('');
  };
  const decide = (decision: Decision) => {
    if (!current) return;
    onDecide(current.id, { decision, reason: decision === 'exclude' ? reason.trim() || undefined : undefined });
    go(at + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'i') decide('include');
      else if (k === 'm') decide('maybe');
      else if (k === 'e') decide('exclude');
      else if (k === 'arrowright' || k === 'j') go(at + 1);
      else if (k === 'arrowleft' || k === 'k') go(at - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Keep the current paper visible in the list.
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [at, view]);

  const pct = counts.total ? Math.round((counts.screened / counts.total) * 100) : 0;
  const share = (n: number) => `${(n / (counts.total || 1)) * 100}%`;
  const decisionOf = (p: Paper) => p.screening?.decision;

  return (
    <div className={styles.panel}>
      <div className={styles.progress}>
        <div
          className={styles.bar}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={counts.total}
          aria-valuenow={counts.screened}
          aria-label={t('screen.progress', { n: counts.screened, total: counts.total })}
        >
          <span className={styles.barInclude} style={{ width: share(counts.included) }} />
          <span className={styles.barMaybe} style={{ width: share(counts.maybe) }} />
          <span className={styles.barExclude} style={{ width: share(counts.excluded) }} />
        </div>
        <span className={styles.progressText}>{t('screen.screened', { n: counts.screened, total: counts.total, pct })}</span>
      </div>

      <div className={styles.stats} role="group" aria-label={t('screen.filterLabel')}>
        {STAT_CARDS.map((c) => (
          <button
            key={c.filter}
            type="button"
            className={`${styles.stat} ${styles[`s_${c.filter}`]} ${view.filter === c.filter ? styles.statOn : ''}`}
            aria-pressed={view.filter === c.filter}
            onClick={() => chooseFilter(c.filter)}
          >
            <span className={styles.statCount}>{c.count(counts)}</span>
            <span className={styles.statLabel}>{t(c.label)}</span>
          </button>
        ))}
      </div>
      <div className={styles.filterLine}>
        <span>{t('screen.showing', { what: t(FILTER_LABELS[view.filter]), n: queue.length })}</span>
        {view.filter !== 'todo' && (
          <button type="button" className={styles.link} onClick={() => chooseFilter('todo')}>
            {t('screen.filter.todo')}
          </button>
        )}
        {view.filter !== 'all' && (
          <button type="button" className={styles.link} onClick={() => chooseFilter('all')}>
            {t('screen.filter.all')}
          </button>
        )}
      </div>

      {current ? (
        <article className={styles.card} aria-labelledby="screen-current-title">
          <div className={styles.nav}>
            <button type="button" className={styles.navBtn} onClick={() => go(at - 1)} disabled={at === 0} aria-label={t('screen.previous')}>
              ←
            </button>
            <span>
              {at + 1} / {queue.length}
            </span>
            <button type="button" className={styles.navBtn} onClick={() => go(at + 1)} disabled={at >= queue.length - 1} aria-label={t('screen.next')}>
              →
            </button>
            <span className={`${styles.decision} ${styles[`d_${decisionOf(current) ?? 'none'}`]}`}>
              {decisionOf(current) ? t(`screen.${decisionOf(current)!}`) : t('screen.pending')}
              {current.screening?.reason && `: ${current.screening.reason}`}
            </span>
          </div>
          <button id="screen-current-title" type="button" className={styles.title} onClick={() => onFocusPaper(current.id)}>
            {current.title}
          </button>
          <div className={styles.meta}>
            {current.year || t('compare.nd')} · {truncateAuthors(current.authors, 4)}
            {current.venue && ` · ${current.venue}`}
          </div>
          <p className={styles.abstract}>{current.abstract || t('screen.noAbstract')}</p>

          <div className={styles.actions}>
            {(['include', 'maybe', 'exclude'] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={`${styles.btn} ${styles[d]} ${decisionOf(current) === d ? styles.btnOn : ''}`}
                aria-pressed={decisionOf(current) === d}
                onClick={() => decide(d)}
              >
                {t(`screen.${d}`)} <kbd>{d === 'include' ? 'I' : d === 'maybe' ? 'M' : 'E'}</kbd>
              </button>
            ))}
          </div>
          <div className={styles.reasons} role="group" aria-label={t('screen.reasonLabel')}>
            <span>{t('screen.reasons')}</span>
            {reasons.map((r) => (
              <button
                key={r}
                type="button"
                className={`${styles.reason} ${reason === r ? styles.reasonOn : ''}`}
                aria-pressed={reason === r}
                onClick={() => setReason(reason === r ? '' : r)}
              >
                {r}
              </button>
            ))}
            <input
              className={styles.reasonInput}
              placeholder={t('screen.otherReason')}
              aria-label={t('screen.otherReason')}
              value={reasons.includes(reason) ? '' : reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {current.screening && (
            <button type="button" className={styles.link} onClick={() => onDecide(current.id, undefined)}>
              {t('screen.undo')}
            </button>
          )}
        </article>
      ) : (
        <div className={styles.empty}>{papers.length ? t('screen.noneHere') : t('screen.empty')}</div>
      )}

      {queue.length > 0 && (
        <ol className={styles.list} ref={listRef} aria-label={t('screen.listLabel')}>
          {queue.map((id, i) => {
            const p = byId.get(id)!;
            const d = decisionOf(p);
            return (
              <li key={id}>
                <button type="button" className={`${styles.row} ${i === at ? styles.rowOn : ''}`} aria-current={i === at} onClick={() => go(i)}>
                  <span className={`${styles.badge} ${styles[`d_${d ?? 'none'}`]}`}>{d ? t(`screen.${d}`) : t('screen.pending')}</span>
                  <span className={styles.rowTitle}>{p.title}</span>
                  <span className={styles.rowYear}>{p.year || ''}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <section className={styles.prisma} aria-labelledby="prisma-title">
        <div className={styles.prismaHeader}>
          <h3 id="prisma-title">{t('screen.prisma')}</h3>
          <button
            type="button"
            className={styles.link}
            onClick={async () => {
              await navigator.clipboard.writeText(prismaMarkdown(counts)).catch(() => undefined);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? t('screen.copied') : t('screen.copyMarkdown')}
          </button>
        </div>
        <PrismaFlow counts={counts} />
      </section>
    </div>
  );
}

/** The PRISMA flow as boxes and arrows: identified → screened → excluded / included, with what is still waiting. */
function PrismaFlow({ counts: c }: { counts: PrismaCounts }) {
  const t = useT();
  return (
    <div className={styles.flow}>
      <div className={styles.flowStage}>{t('screen.stage.identification')}</div>
      <div className={styles.flowBox}>
        <strong>{t('screen.flow.identified', { n: c.total })}</strong>
        {c.bySource.length > 0 && <span>{c.bySource.map(([s, n]) => `${s} ${n}`).join(' · ')}</span>}
      </div>
      <div className={styles.flowArrow} aria-hidden="true">
        ↓
      </div>
      <div className={styles.flowStage}>{t('screen.stage.screening')}</div>
      <div className={styles.flowRow}>
        <div className={styles.flowBox}>
          <strong>{t('screen.flow.screened', { n: c.screened })}</strong>
          {c.pending + c.maybe > 0 && <span>{t('screen.flow.waiting', { n: c.pending + c.maybe, maybe: c.maybe })}</span>}
        </div>
        <div className={styles.flowSide} aria-hidden="true">
          →
        </div>
        <div className={`${styles.flowBox} ${styles.flowExcluded}`}>
          <strong>{t('screen.flow.excluded', { n: c.excluded })}</strong>
          {c.reasons.map(([r, n]) => (
            <span key={r}>
              {r === '理由なし' ? t('screen.flow.noReason') : r}: {n}
            </span>
          ))}
        </div>
      </div>
      <div className={styles.flowArrow} aria-hidden="true">
        ↓
      </div>
      <div className={styles.flowStage}>{t('screen.stage.included')}</div>
      <div className={`${styles.flowBox} ${styles.flowIncluded}`}>
        <strong>{t('screen.flow.included', { n: c.included })}</strong>
      </div>
    </div>
  );
}
