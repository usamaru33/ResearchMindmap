import { useMemo } from 'react';
import { parseName } from '../../../shared/biblio/names';
import type { Paper } from '../../types';
import { useT } from '../../hooks/useT';
import type { MessageKey } from '../../i18n';
import { mapStats, type Count } from '../../store/stats';
import { STATUS_OPTIONS } from '../../utils/reading';
import { SCREENING_COLORS } from '../MindMap/mapViewContext';
import { YearHistogram } from '../Explore/YearHistogram';
import styles from './Analysis.module.css';

interface MapStatsViewProps {
  papers: Paper[];
  filter: string;
  onFilter: (text: string) => void;
  onFocusPaper: (id: string) => void;
}

function pct(n: number, total: number): string {
  return total ? `${Math.round((n / total) * 100)}%` : '—';
}

function Ranking({ title, items, onPick }: { title: string; items: Count[]; onPick: (label: string) => void }) {
  if (items.length === 0) return null;
  const max = items[0].count;
  return (
    <section className={styles.ranking}>
      <h4>{title}</h4>
      <ul>
        {items.map((it) => (
          <li key={it.label}>
            <button type="button" onClick={() => onPick(it.label)} title={it.label}>
              <span className={styles.rankBar} style={{ width: `${(it.count / max) * 100}%` }} />
              <span className={styles.rankLabel}>{it.label}</span>
              <span className={styles.rankCount}>{it.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stacked({ parts, total }: { parts: Array<{ label: string; count: number; color: string }>; total: number }) {
  return (
    <div>
      <div className={styles.stacked} role="img" aria-label={parts.map((p) => `${p.label} ${p.count}`).join(', ')}>
        {parts
          .filter((p) => p.count > 0)
          .map((p) => (
            <span key={p.label} style={{ width: `${(p.count / total) * 100}%`, background: p.color }} title={`${p.label} ${p.count}`} />
          ))}
      </div>
      <div className={styles.legend}>
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label} {p.count}
          </span>
        ))}
      </div>
    </div>
  );
}

const SCREEN_LABELS: Record<'include' | 'maybe' | 'exclude' | 'pending', MessageKey> = {
  include: 'screen.include',
  maybe: 'screen.maybe',
  exclude: 'screen.exclude',
  pending: 'stats.pending',
};

/** Counts over the papers in the map; clicking an item puts it in the map filter. */
export function MapStatsView({ papers, filter, onFilter, onFocusPaper }: MapStatsViewProps) {
  const t = useT();
  const s = useMemo(() => mapStats(papers), [papers]);
  if (s.total === 0) return <p className={styles.empty}>{t('stats.empty')}</p>;
  const screened = s.screening.include + s.screening.maybe + s.screening.exclude > 0;

  return (
    <div className={styles.view}>
      {filter.trim() && (
        <div className={styles.filterNote}>
          <span>{t('stats.filtering', { text: filter })}</span>
          <button type="button" onClick={() => onFilter('')}>
            {t('stats.clearFilter')}
          </button>
        </div>
      )}

      <div className={styles.cards}>
        <div>
          <strong>{s.total}</strong>
          <span>{t('stats.papers')}</span>
        </div>
        <div>
          <strong>{pct(s.status.read, s.total)}</strong>
          <span>{t('stats.read')}</span>
        </div>
        <div>
          <strong>{pct(s.openAccess, s.total)}</strong>
          <span>{t('stats.oa')}</span>
        </div>
        <div>
          <strong>{s.citations.known ? s.citations.median.toLocaleString() : '—'}</strong>
          <span>{t('stats.medianCites')}</span>
        </div>
      </div>

      {s.byYear.length > 0 && (
        <section>
          <h4>{t('stats.byYear')}</h4>
          <YearHistogram byYear={s.byYear} onPickYear={(y) => onFilter(String(y))} />
          {s.undated > 0 && <p className={styles.note}>{t('stats.undated', { n: s.undated })}</p>}
        </section>
      )}

      <section>
        <h4>{t('stats.status')}</h4>
        <Stacked total={s.total} parts={STATUS_OPTIONS.map((o) => ({ label: t(o.label), count: s.status[o.value], color: o.color }))} />
      </section>

      {screened && (
        <section>
          <h4>{t('stats.screening')}</h4>
          <Stacked
            total={s.total}
            parts={(['include', 'maybe', 'exclude', 'pending'] as const).map((k) => ({ label: t(SCREEN_LABELS[k]), count: s.screening[k], color: SCREENING_COLORS[k] }))}
          />
        </section>
      )}

      <div className={styles.rankings}>
        <Ranking title={t('stats.venues')} items={s.venues} onPick={onFilter} />
        <Ranking title={t('stats.authors')} items={s.authors} onPick={(name) => onFilter(parseName(name).family || name)} />
        <Ranking title={t('stats.tags')} items={s.tags} onPick={onFilter} />
        <Ranking title={t('stats.publishers')} items={s.publishers} onPick={onFilter} />
      </div>

      {s.topCited.length > 0 && (
        <section>
          <h4>{t('stats.topCited')}</h4>
          <ol className={styles.topList}>
            {s.topCited.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onFocusPaper(p.id)}>
                  <span>{p.title}</span>
                  <span className={styles.rankCount}>{p.citationCount?.toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      <p className={styles.note}>{t('stats.abstracts', { n: s.withAbstract, total: s.total })}</p>
    </div>
  );
}
