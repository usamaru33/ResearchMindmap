import type { TrendsResponse } from '../../shared/types';

export type TrendMode = 'count' | 'share';

/** Per-mille of all works that year (0 when the total is unknown). */
export function shareOf(count: number, all: number | undefined): number {
  return all ? (count / all) * 1000 : 0;
}

/** Values per year for each series, as counts or shares. */
export function trendValues(r: TrendsResponse, mode: TrendMode): number[][] {
  const all = new Map((r.all ?? []).map((y) => [y.year, y.count]));
  return r.series.map((s) => s.byYear.map((y) => (mode === 'count' ? y.count : shareOf(y.count, all.get(y.year)))));
}

/** A round upper bound for an axis: 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

export function formatValue(v: number, mode: TrendMode): string {
  if (v === 0) return '0';
  if (mode === 'share') return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2);
  return v >= 10000 ? `${Math.round(v / 1000)}k` : v.toLocaleString();
}

/** year, one column per query (counts), and all works when known. */
export function trendsCsv(r: TrendsResponse): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const ok = r.series.filter((s) => !s.error);
  const header = ['year', ...ok.map((s) => esc(s.query)), ...(r.all ? ['all works'] : [])];
  const all = new Map((r.all ?? []).map((y) => [y.year, y.count]));
  const rows = [];
  for (let year = r.yearMin; year <= r.yearMax; year++) {
    rows.push([String(year), ...ok.map((s) => String(s.byYear.find((y) => y.year === year)?.count ?? 0)), ...(r.all ? [String(all.get(year) ?? '')] : [])].join(','));
  }
  return [header.join(','), ...rows].join('\n') + '\n';
}
