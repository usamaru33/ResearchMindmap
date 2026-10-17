import { matchesQuery, type ParsedQuery } from '../../shared/query';
import type { Paper, SourceName, SourceReport } from '../../shared/types';
import type { AppConfig } from '../config';
import type { HttpClient } from '../infra/http';
import type { SourceAdapter, SourceResult } from '../sources/types';
import { fuseRankedLists } from './rank';

export interface SearchOptions {
  sources?: SourceName[];
  limitPerSource: number;
  limit: number;
  enrich: boolean;
  /** Per-source wall clock limit. */
  timeoutMs?: number;
}

export interface SearchDeps {
  http: HttpClient;
  config: AppConfig;
  adapters: SourceAdapter[];
  enrich: (papers: Paper[]) => Promise<{ papers: Paper[]; enriched: number; error?: string }>;
}

export interface SearchOutcome {
  results: Paper[];
  perSource: SourceReport[];
  warnings: string[];
  candidates: number;
  enriched: number;
}

async function runSource(
  adapter: SourceAdapter,
  query: ParsedQuery,
  opts: SearchOptions,
  deps: SearchDeps,
): Promise<{ report: SourceReport; result?: SourceResult }> {
  const started = Date.now();
  const status = adapter.status(deps.config);
  const base = { name: adapter.name, label: adapter.label };
  if (!status.enabled) {
    return { report: { ...base, status: 'skipped', count: 0, warnings: [], tookMs: 0, error: status.reason } };
  }
  try {
    const result = await adapter.search(query, { limit: opts.limitPerSource }, {
      http: deps.http,
      config: deps.config,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
    });
    return {
      result,
      report: {
        ...base,
        status: 'ok',
        count: result.papers.length,
        total: result.total,
        warnings: result.warnings,
        approximate: result.approximate,
        tookMs: Date.now() - started,
      },
    };
  } catch (err) {
    const message = (err as Error).name === 'TimeoutError' ? `${adapter.label}: タイムアウトしました` : (err as Error).message;
    return { report: { ...base, status: 'error', count: 0, warnings: [], tookMs: Date.now() - started, error: message } };
  }
}

/** Search every selected source in parallel, merge, enrich, post-filter and rank. See DESIGN §5.4. */
export async function searchAll(query: ParsedQuery, opts: SearchOptions, deps: SearchDeps): Promise<SearchOutcome> {
  const adapters = deps.adapters.filter((a) => !opts.sources || opts.sources.includes(a.name));
  const runs = await Promise.all(adapters.map((a) => runSource(a, query, opts, deps)));

  const lists: Paper[][] = [];
  const exactSources = new Set<SourceName>();
  for (const run of runs) {
    if (!run.result) continue;
    // Cap each list so a source that over-fetched for post-filtering does not dominate RRF.
    lists.push(run.result.papers.slice(0, opts.limitPerSource * 2));
    if (!run.result.approximate) exactSources.add(run.report.name);
  }

  const fused = fuseRankedLists(lists);
  const warnings: string[] = [];
  let papers = fused;
  let enriched = 0;
  if (opts.enrich && fused.length > 0) {
    const r = await deps.enrich(fused);
    papers = r.papers;
    enriched = r.enriched;
    if (r.error) warnings.push(`OpenAlex での補完に失敗しました: ${r.error}`);
  }

  // A paper returned by a source that evaluated the whole query is trusted;
  // otherwise re-check it against the query with the (now enriched) metadata.
  const filtersOnly: ParsedQuery = { text: null, filters: query.filters };
  const kept = papers.filter((p) => {
    const trusted = (p.sources ?? []).some((s) => exactSources.has(s));
    return trusted ? matchesQuery(filtersOnly, p) : matchesQuery(query, p);
  });

  // Report how many results of each source survived.
  for (const run of runs) {
    if (run.report.status !== 'ok') continue;
    run.report.kept = kept.filter((p) => p.sources?.includes(run.report.name)).length;
  }

  return {
    results: kept.slice(0, opts.limit),
    perSource: runs.map((r) => r.report),
    warnings,
    candidates: fused.length,
    enriched,
  };
}
