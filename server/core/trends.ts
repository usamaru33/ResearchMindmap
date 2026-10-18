import { parseQuery } from '../../shared/query';
import type { TrendSeries, TrendsResponse, YearCount } from '../../shared/types';
import { compileOpenAlex } from '../sources/openalex';
import type { ExpandContext } from './expand';

export interface TrendsOptions {
  yearMin: number;
  yearMax: number;
  /** Also fetch the number of all works per year, to compare shares. */
  share: boolean;
}

interface GroupByResponse {
  meta?: { count?: number };
  group_by: Array<{ key: string; count: number }>;
}

/** Fill silent years with 0 so lines do not jump over them. */
function series(groups: GroupByResponse['group_by'], yearMin: number, yearMax: number): YearCount[] {
  const counts = new Map(groups.map((g) => [Number(g.key), g.count]));
  return Array.from({ length: yearMax - yearMin + 1 }, (_, i) => ({ year: yearMin + i, count: counts.get(yearMin + i) ?? 0 }));
}

/** The OpenAlex request for a query, turned into a count per publication year. */
export function trendUrl(query: string, opts: { yearMin: number; yearMax: number; apiKey?: string }): { url: string; approximate: boolean } | { error: string } {
  const parsed = parseQuery(query);
  if (!parsed.ok) return { error: parsed.errors[0].message };
  const q = parsed.query;
  // The query's own year filter narrows the requested range.
  const yearMin = Math.max(opts.yearMin, q.filters.yearMin ?? opts.yearMin);
  const yearMax = Math.min(opts.yearMax, q.filters.yearMax ?? opts.yearMax);
  const compiled = compileOpenAlex({ ...q, filters: { ...q.filters, yearMin, yearMax } }, { limit: 1, apiKey: opts.apiKey });
  const url = new URL(compiled.url);
  url.searchParams.delete('per-page');
  url.searchParams.delete('select');
  url.searchParams.set('group_by', 'publication_year');
  return { url: url.toString(), approximate: compiled.approximate };
}

/**
 * Papers per year for each query on OpenAlex. Counts come straight from OpenAlex's
 * group_by, so conditions that search normally checks after fetching (wildcards,
 * venues, types…) are not applied: such series are flagged approximate.
 */
export async function queryTrends(queries: string[], opts: TrendsOptions, ctx: ExpandContext): Promise<TrendsResponse> {
  const out: TrendSeries[] = await Promise.all(
    queries.map(async (query): Promise<TrendSeries> => {
      const req = trendUrl(query, { ...opts, apiKey: ctx.apiKey });
      if ('error' in req) return { query, byYear: [], total: 0, approximate: false, error: 'invalid_query', message: req.error };
      try {
        const { data } = await ctx.http.getJson<GroupByResponse>('openalex', req.url, { signal: ctx.signal });
        const byYear = series(data.group_by, opts.yearMin, opts.yearMax);
        return { query, byYear, total: byYear.reduce((s, y) => s + y.count, 0), approximate: req.approximate };
      } catch (err) {
        return { query, byYear: [], total: 0, approximate: req.approximate, error: 'upstream', message: (err as Error).message };
      }
    }),
  );
  let all: YearCount[] | undefined;
  if (opts.share) {
    const p = new URLSearchParams({ filter: `publication_year:${opts.yearMin}-${opts.yearMax}`, group_by: 'publication_year' });
    if (ctx.apiKey) p.set('api_key', ctx.apiKey);
    all = await ctx.http
      .getJson<GroupByResponse>('openalex', `https://api.openalex.org/works?${p}`, { signal: ctx.signal })
      .then(({ data }) => series(data.group_by, opts.yearMin, opts.yearMax))
      .catch(() => undefined);
  }
  return { series: out, all, yearMin: opts.yearMin, yearMax: opts.yearMax };
}
