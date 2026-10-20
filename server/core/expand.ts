import { normalizeOpenAlexId } from '../../shared/ids';
import type { ExpandKind, Paper } from '../../shared/types';
import type { HttpClient } from '../infra/http';
import { OPENALEX_SELECT, normalizeOpenAlexWork, type OpenAlexWork } from '../sources/openalex';

const BASE = 'https://api.openalex.org/works';

export interface ExpandContext {
  http: HttpClient;
  apiKey?: string;
  signal?: AbortSignal;
}

interface WorkLinks {
  id: string;
  referenced_works?: string[];
  related_works?: string[];
}

function withKey(params: URLSearchParams, apiKey?: string): URLSearchParams {
  if (apiKey) params.set('api_key', apiKey);
  return params;
}

/** Locate the paper in OpenAlex (single-entity lookups are free) and read its link lists. */
async function resolveWork(paper: Paper, ctx: ExpandContext): Promise<WorkLinks | null> {
  // The ids come from the browser: keep them to one path segment of the OpenAlex URL.
  const id = normalizeOpenAlexId(paper.ids?.openalex) ?? (paper.ids?.doi ? `doi:${paper.ids.doi}` : paper.ids?.arxiv ? `doi:10.48550/arxiv.${paper.ids.arxiv}` : null);
  if (!id) return null;
  const key = encodeURIComponent(id);
  try {
    const params = withKey(new URLSearchParams({ select: 'id,referenced_works,related_works' }), ctx.apiKey);
    const { data } = await ctx.http.getJson<WorkLinks>('openalex', `${BASE}/${key}?${params.toString()}`, { signal: ctx.signal });
    return data;
  } catch {
    return null;
  }
}

/** Fetch works by OpenAlex id, 100 per request. */
export async function fetchWorksById(ids: string[], ctx: ExpandContext): Promise<Paper[]> {
  const out: Paper[] = [];
  const unique = [...new Set(ids.map((i) => normalizeOpenAlexId(i)).filter((i): i is string => !!i))];
  for (let i = 0; i < unique.length; i += 100) {
    const params = withKey(
      new URLSearchParams({ filter: `openalex:${unique.slice(i, i + 100).join('|')}`, 'per-page': '100', select: OPENALEX_SELECT }),
      ctx.apiKey,
    );
    const { data } = await ctx.http.getJson<{ results: OpenAlexWork[] }>('openalex', `${BASE}?${params.toString()}`, { signal: ctx.signal });
    out.push(...data.results.map(normalizeOpenAlexWork));
  }
  return out;
}

const byCitations = (a: Paper, b: Paper) => (b.citationCount ?? 0) - (a.citationCount ?? 0);

/**
 * Snowballing from one paper: what it cites (backward), what cites it
 * (forward), or OpenAlex's related works. Results are sorted by citation count.
 */
export async function expandPaper(
  paper: Paper,
  kind: ExpandKind,
  limit: number,
  ctx: ExpandContext,
): Promise<{ papers: Paper[]; total: number; warnings: string[] }> {
  const work = await resolveWork(paper, ctx);
  if (!work) {
    return { papers: [], total: 0, warnings: ['OpenAlex でこの論文を見つけられませんでした（DOI か arXiv ID が必要です）'] };
  }
  const workId = normalizeOpenAlexId(work.id)!;

  if (kind === 'citations') {
    const params = withKey(
      new URLSearchParams({ filter: `cites:${workId}`, sort: 'cited_by_count:desc', 'per-page': String(Math.min(100, limit)), select: OPENALEX_SELECT }),
      ctx.apiKey,
    );
    const { data } = await ctx.http.getJson<{ meta: { count: number }; results: OpenAlexWork[] }>('openalex', `${BASE}?${params.toString()}`, { signal: ctx.signal });
    return { papers: data.results.map(normalizeOpenAlexWork), total: data.meta.count, warnings: [] };
  }

  const ids = kind === 'references' ? (work.referenced_works ?? paper.referenceIds ?? []) : (work.related_works ?? []);
  if (ids.length === 0) {
    return { papers: [], total: 0, warnings: [kind === 'references' ? 'OpenAlex に参考文献の情報がありません' : '関連論文が見つかりませんでした'] };
  }
  const papers = (await fetchWorksById(ids, ctx)).sort(byCitations);
  return { papers: papers.slice(0, limit), total: ids.length, warnings: [] };
}
