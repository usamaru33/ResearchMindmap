import { useState } from 'react';
import type { TrendsResponse } from '../../../shared/types';
import { apiPost } from '../../api/client';
import { useT } from '../../hooks/useT';
import { downloadText } from '../../utils/download';
import { formatValue, niceMax, trendValues, trendsCsv, type TrendMode } from '../../utils/trends';
import styles from './Analysis.module.css';

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9'];
const MAX_QUERIES = 5;
const W = 360;
const H = 200;
const PAD = { left: 40, right: 8, top: 10, bottom: 22 };

interface TrendsViewProps {
  /** Starting query, e.g. the map's latest search. */
  initialQuery: string;
}

function Chart({ data, mode }: { data: TrendsResponse; mode: TrendMode }) {
  const t = useT();
  const values = trendValues(data, mode);
  const years = data.yearMax - data.yearMin;
  const max = niceMax(Math.max(0, ...values.flat()));
  const x = (i: number) => PAD.left + (years ? (i / years) * (W - PAD.left - PAD.right) : (W - PAD.left - PAD.right) / 2);
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
  const step = Math.max(1, Math.ceil((years + 1) / 6));
  const current = new Date().getFullYear();
  return (
    <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('trends.chartLabel')}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(max * f)} y2={y(max * f)} className={styles.grid} />
          <text x={PAD.left - 4} y={y(max * f) + 3} className={styles.axisY}>
            {formatValue(max * f, mode)}
          </text>
        </g>
      ))}
      {Array.from({ length: years + 1 }, (_, i) => i)
        .filter((i) => i % step === 0 || i === years)
        .map((i) => (
          <text key={i} x={x(i)} y={H - 6} className={styles.axisX}>
            {data.yearMin + i}
          </text>
        ))}
      {values.map((vals, s) =>
        data.series[s].error ? null : (
          <g key={s}>
            <polyline
              fill="none"
              stroke={COLORS[s % COLORS.length]}
              strokeWidth={2}
              strokeDasharray={data.series[s].approximate ? '5 3' : undefined}
              points={vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            />
            {vals.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={COLORS[s % COLORS.length]} opacity={data.yearMin + i === current ? 0.4 : 1}>
                <title>
                  {data.series[s].query} · {data.yearMin + i}: {formatValue(v, mode)}
                  {mode === 'share' ? '‰' : ''}
                </title>
              </circle>
            ))}
          </g>
        ),
      )}
    </svg>
  );
}

/** Papers per year for up to five queries on OpenAlex, as counts or shares of all works. */
export function TrendsView({ initialQuery }: TrendsViewProps) {
  const t = useT();
  const year = new Date().getFullYear();
  const [queries, setQueries] = useState<string[]>([initialQuery, '']);
  const [from, setFrom] = useState(year - 19);
  const [to, setTo] = useState(year);
  const [mode, setMode] = useState<TrendMode>('count');
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filled = queries.map((q) => q.trim()).filter(Boolean);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiPost<TrendsResponse>('/api/trends', { queries: filled, yearMin: Math.min(from, to), yearMax: Math.max(from, to), share: true }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const setQuery = (i: number, value: string) => setQueries((qs) => qs.map((q, j) => (j === i ? value : q)));

  return (
    <div className={styles.view}>
      <p className={styles.note}>{t('trends.hint')}</p>
      <div className={styles.queries}>
        {queries.map((q, i) => (
          <div key={i} className={styles.queryRow}>
            <i style={{ background: COLORS[i] }} />
            <input
              value={q}
              onChange={(e) => setQuery(i, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && filled.length > 0 && void run()}
              placeholder={i === 0 ? '"large language model"' : t('trends.another')}
              aria-label={t('trends.queryLabel', { n: i + 1 })}
            />
            {queries.length > 1 && (
              <button type="button" aria-label={t('trends.remove', { n: i + 1 })} onClick={() => setQueries((qs) => qs.filter((_, j) => j !== i))}>
                ×
              </button>
            )}
          </div>
        ))}
        {queries.length < MAX_QUERIES && (
          <button type="button" className={styles.addQuery} onClick={() => setQueries((qs) => [...qs, ''])}>
            {t('trends.add')}
          </button>
        )}
      </div>
      <div className={styles.controls}>
        <label>
          {t('trends.from')}
          <input type="number" value={from} min={1900} max={year} onChange={(e) => setFrom(Number(e.target.value) || year - 19)} />
        </label>
        <label>
          {t('trends.to')}
          <input type="number" value={to} min={1900} max={year} onChange={(e) => setTo(Number(e.target.value) || year)} />
        </label>
        <button type="button" className={styles.primary} onClick={run} disabled={loading || filled.length === 0}>
          {loading ? t('trends.loading') : t('trends.run')}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}

      {data && (
        <section>
          <div className={styles.chartHeader}>
            <div className={styles.segmented} role="group" aria-label={t('trends.mode')}>
              <button type="button" aria-pressed={mode === 'count'} onClick={() => setMode('count')}>
                {t('trends.count')}
              </button>
              <button type="button" aria-pressed={mode === 'share'} disabled={!data.all} onClick={() => setMode('share')}>
                {t('trends.share')}
              </button>
            </div>
            <button type="button" className={styles.link} onClick={() => downloadText('trends.csv', trendsCsv(data), 'text/csv')}>
              CSV
            </button>
          </div>
          <Chart data={data} mode={mode} />
          <ul className={styles.legendList}>
            {data.series.map((s, i) => (
              <li key={i}>
                <i style={{ background: COLORS[i % COLORS.length] }} />
                <span className={styles.rankLabel}>{s.query}</span>
                {s.error ? (
                  <span className={styles.error} title={s.message}>
                    {t(s.error === 'invalid_query' ? 'trends.invalid' : 'trends.failed')}
                  </span>
                ) : (
                  <span className={styles.rankCount}>
                    {t('trends.total', { total: s.total.toLocaleString() })}
                    {s.approximate && ` · ${t('trends.approx')}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className={styles.note}>
            {mode === 'share' ? t('trends.shareNote') : t('trends.countNote')}
            {data.yearMax === year && ` ${t('trends.partialYear', { year })}`}
          </p>
        </section>
      )}
    </div>
  );
}
