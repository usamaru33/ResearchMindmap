import type { Paper } from '../../shared/types';
import type { HttpClient } from '../infra/http';
import { OPENALEX_SELECT, normalizeOpenAlexWork, type OpenAlexWork } from '../sources/openalex';
import { mergeTwo } from './merge';

const BATCH = 100;

/** DOI under which OpenAlex indexes the paper (arXiv-only papers use the arXiv DOI). */
function lookupDoi(p: Paper): string | undefined {
  return p.ids?.doi ?? (p.ids?.arxiv ? `10.48550/arxiv.${p.ids.arxiv}` : undefined);
}

function needsEnrichment(p: Paper): boolean {
  return !p.ids?.openalex || !p.abstract || !p.topics?.length;
}

export interface EnrichOptions {
  http: HttpClient;
  apiKey?: string;
  signal?: AbortSignal;
  /** Cap on OpenAlex calls (each covers up to 100 papers). */
  maxCalls?: number;
}

/**
 * Fill abstracts, topics, references and citation counts from OpenAlex by DOI
 * (batched, filter-only requests, which are cheap). Papers keep their original
 * `sources`, since being enriched is not the same as being found.
 */
export async function enrichWithOpenAlex(papers: Paper[], opts: EnrichOptions): Promise<{ papers: Paper[]; enriched: number; error?: string }> {
  const targets = papers
    .map((p, i) => ({ i, doi: lookupDoi(p) }))
    .filter((t): t is { i: number; doi: string } => !!t.doi && needsEnrichment(papers[t.i]));
  const out = [...papers];
  let enriched = 0;
  const maxCalls = opts.maxCalls ?? 3;

  for (let start = 0, calls = 0; start < targets.length && calls < maxCalls; start += BATCH, calls++) {
    const chunk = targets.slice(start, start + BATCH);
    const params = new URLSearchParams({
      filter: `doi:${chunk.map((t) => t.doi).join('|')}`,
      'per-page': String(BATCH),
      select: OPENALEX_SELECT,
    });
    if (opts.apiKey) params.set('api_key', opts.apiKey);
    try {
      const { data } = await opts.http.getJson<{ results: OpenAlexWork[] }>(
        'openalex',
        `https://api.openalex.org/works?${params.toString()}`,
        { signal: opts.signal },
      );
      const byDoi = new Map<string, Paper>();
      for (const work of data.results) {
        const p = normalizeOpenAlexWork(work);
        if (p.ids?.doi) byDoi.set(p.ids.doi, p);
      }
      for (const t of chunk) {
        const match = byDoi.get(t.doi.toLowerCase());
        if (!match) continue;
        const original = out[t.i];
        out[t.i] = { ...mergeTwo(original, match), sources: original.sources, relevance: original.relevance };
        enriched++;
      }
    } catch (err) {
      return { papers: out, enriched, error: (err as Error).message };
    }
  }
  return { papers: out, enriched };
}
