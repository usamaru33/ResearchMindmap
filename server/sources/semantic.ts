import type { Paper } from '../../shared/types';
import { OPENALEX_SELECT, normalizeOpenAlexWork, type OpenAlexWork } from './openalex';
import { S2_FIELDS, normalizeS2Paper, s2Headers, type S2Paper } from './semanticscholar';
import type { SourceContext } from './types';

/** OpenAlex embedding search (GTE-large over title+abstract). Max 50 results, 2,000 chars of input. */
export async function openAlexSemanticSearch(
  text: string,
  opts: { limit: number; yearMin?: number; yearMax?: number },
  ctx: SourceContext,
): Promise<Paper[]> {
  const params = new URLSearchParams({
    'search.semantic': text.slice(0, 2000),
    'per-page': String(Math.min(50, opts.limit)),
    select: OPENALEX_SELECT,
  });
  const filters: string[] = [];
  if (opts.yearMin !== undefined) filters.push(`publication_year:>${opts.yearMin - 1}`);
  if (opts.yearMax !== undefined) filters.push(`publication_year:<${opts.yearMax + 1}`);
  if (filters.length) params.set('filter', filters.join(','));
  if (ctx.config.openalexApiKey) params.set('api_key', ctx.config.openalexApiKey);
  const { data } = await ctx.http.getJson<{ results: OpenAlexWork[] }>(
    'openalex-semantic',
    `https://api.openalex.org/works?${params.toString()}`,
    { signal: ctx.signal, timeoutMs: 30_000 },
  );
  return data.results.map(normalizeOpenAlexWork).map((p) => ({ ...p, sources: ['openalex'] }));
}

/** Semantic Scholar relevance search with natural-language text. */
export async function s2TextSearch(text: string, opts: { limit: number }, ctx: SourceContext): Promise<Paper[]> {
  const params = new URLSearchParams({
    query: text.slice(0, 300),
    limit: String(Math.min(100, opts.limit)),
    fields: S2_FIELDS,
  });
  const { data } = await ctx.http.getJson<{ data?: S2Paper[] }>(
    'semanticscholar',
    `https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`,
    { headers: s2Headers(ctx.config.semanticScholarApiKey), signal: ctx.signal, retries: ctx.config.semanticScholarApiKey ? 3 : 1 },
  );
  return (data.data ?? []).map(normalizeS2Paper).filter((p) => p.title);
}
