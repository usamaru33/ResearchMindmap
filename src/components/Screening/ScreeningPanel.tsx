import { useEffect, useMemo, useState } from 'react';
import type { Screening } from '../../../shared/types';
import type { Paper } from '../../types';
import { EXCLUSION_REASONS, prismaCounts, prismaMarkdown, screeningQueue } from '../../store/screening';
import { truncateAuthors } from '../../utils/helpers';
import { useT } from '../../hooks/useT';
import styles from './ScreeningPanel.module.css';

interface ScreeningPanelProps {
  papers: Paper[];
  onDecide: (id: string, screening: Screening | undefined) => void;
  onFocusPaper: (id: string) => void;
}

export function ScreeningPanel({ papers, onDecide, onFocusPaper }: ScreeningPanelProps) {
  const t = useT();
  const reasons = EXCLUSION_REASONS[t.lang];
  const counts = useMemo(() => prismaCounts(papers), [papers]);
  // The queue order is fixed when the panel opens so decided papers do not jump away mid-session.
  const [order] = useState(() => screeningQueue(papers).map((p) => p.id));
  const byId = useMemo(() => new Map(papers.map((p) => [p.id, p])), [papers]);
  const queue = useMemo(
    () => [...order.filter((id) => byId.has(id)), ...papers.filter((p) => !order.includes(p.id)).map((p) => p.id)],
    [order, byId, papers],
  );
  const [index, setIndex] = useState(0);
  const [reason, setReason] = useState('');
  const [copied, setCopied] = useState(false);
  const current = byId.get(queue[Math.min(index, queue.length - 1)]);

  const decide = (decision: Screening['decision']) => {
    if (!current) return;
    onDecide(current.id, { decision, reason: decision === 'exclude' ? reason.trim() || undefined : undefined });
    setReason('');
    setIndex((i) => Math.min(i + 1, queue.length - 1));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'i') decide('include');
      else if (k === 'm') decide('maybe');
      else if (k === 'e') decide('exclude');
      else if (k === 'arrowright' || k === 'j') setIndex((i) => Math.min(i + 1, queue.length - 1));
      else if (k === 'arrowleft' || k === 'k') setIndex((i) => Math.max(i - 1, 0));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pct = counts.total ? Math.round((counts.screened / counts.total) * 100) : 0;

  return (
    <div className={styles.panel}>
      <div className={styles.progress} aria-label={t('screen.progress', { n: counts.screened, total: counts.total })}>
        <div className={styles.bar}>
          <span className={styles.barInclude} style={{ width: `${(counts.included / (counts.total || 1)) * 100}%` }} />
          <span className={styles.barMaybe} style={{ width: `${(counts.maybe / (counts.total || 1)) * 100}%` }} />
          <span className={styles.barExclude} style={{ width: `${(counts.excluded / (counts.total || 1)) * 100}%` }} />
        </div>
        <div className={styles.counts}>
          <span>
            {t('screen.screened', { n: counts.screened, total: counts.total, pct })}
          </span>
          <span className={styles.inc}>{t('screen.include')} {counts.included}</span>
          <span className={styles.may}>{t('screen.maybe')} {counts.maybe}</span>
          <span className={styles.exc}>{t('screen.exclude')} {counts.excluded}</span>
        </div>
      </div>

      {current ? (
        <article className={styles.card}>
          <div className={styles.nav}>
            <button type="button" className={styles.navBtn} onClick={() => setIndex((i) => Math.max(i - 1, 0))} disabled={index === 0} aria-label={t('screen.previous')}>
              ←
            </button>
            <span>
              {Math.min(index, queue.length - 1) + 1} / {queue.length}
            </span>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => setIndex((i) => Math.min(i + 1, queue.length - 1))}
              disabled={index >= queue.length - 1}
              aria-label={t('screen.next')}
            >
              →
            </button>
            {current.screening && (
              <span className={`${styles.decision} ${styles[`d_${current.screening.decision}`]}`}>
                {t(`screen.${current.screening.decision}`)}
                {current.screening.reason && `: ${current.screening.reason}`}
              </span>
            )}
          </div>
          <button type="button" className={styles.title} onClick={() => onFocusPaper(current.id)}>
            {current.title}
          </button>
          <div className={styles.meta}>
            {current.year || t('compare.nd')} · {truncateAuthors(current.authors, 4)}
            {current.venue && ` · ${current.venue}`}
          </div>
          <p className={styles.abstract}>{current.abstract || t('screen.noAbstract')}</p>

          <div className={styles.actions}>
            <button type="button" className={`${styles.btn} ${styles.include}`} onClick={() => decide('include')}>
              {t('screen.include')} <kbd>I</kbd>
            </button>
            <button type="button" className={`${styles.btn} ${styles.maybe}`} onClick={() => decide('maybe')}>
              {t('screen.maybe')} <kbd>M</kbd>
            </button>
            <button type="button" className={`${styles.btn} ${styles.exclude}`} onClick={() => decide('exclude')}>
              {t('screen.exclude')} <kbd>E</kbd>
            </button>
          </div>
          <div className={styles.reasons}>
            <span>{t('screen.reasons')}</span>
            {reasons.map((r) => (
              <button
                key={r}
                type="button"
                className={`${styles.reason} ${reason === r ? styles.reasonOn : ''}`}
                onClick={() => setReason(reason === r ? '' : r)}
              >
                {r}
              </button>
            ))}
            <input
              className={styles.reasonInput}
              placeholder={t('screen.otherReason')}
              aria-label={t('screen.reasonLabel')}
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
        <div className={styles.empty}>{t('screen.empty')}</div>
      )}

      <section className={styles.prisma}>
        <div className={styles.prismaHeader}>
          <span>{t('screen.prisma')}</span>
          <button
            type="button"
            className={styles.link}
            onClick={async () => {
              await navigator.clipboard.writeText(prismaMarkdown(counts)).catch(() => undefined);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? t('screen.copied') : t('screen.copy')}
          </button>
        </div>
        <pre>{prismaMarkdown(counts)}</pre>
      </section>
    </div>
  );
}
