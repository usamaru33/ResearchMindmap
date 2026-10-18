import { arxivIdFromDoi, normalizeArxivId, normalizeDoi } from '../../shared/ids';
import { makePaper } from '../../shared/paper';
import { collectTerms, publisherFromDoi, type ParsedQuery } from '../../shared/query';
import type { Paper } from '../../shared/types';
import type { CompiledRequest } from './openalex';
import type { SourceAdapter, SourceResult } from './types';

const BASE = 'https://api.semanticscholar.org/graph/v1/paper/search';
export const S2_FIELDS = [
  'paperId',
  'externalIds',
  'title',
  'abstract',
  'year',
  'venue',
  'authors',
  'citationCount',
  'openAccessPdf',
  'publicationTypes',
  's2FieldsOfStudy',
  'url',
  'journal',
].join(',');

const TYPE_MAP: Record<string, string> = {
  article: 'JournalArticle',
  journal: 'JournalArticle',
  'journal-article': 'JournalArticle',
  conference: 'Conference',
  proceedings: 'Conference',
  'proceedings-article': 'Conference',
  review: 'Review',
  preprint: 'JournalArticle',
};

/**
 * The relevance endpoint takes plain text only, so the positive terms are sent
 * as a natural-language query and the boolean structure is re-checked locally.
 */
export function compileSemanticScholar(q: ParsedQuery, opts: { limit: number }): CompiledRequest {
  const warnings: string[] = [];
  const positive = collectTerms(q.text).filter((c) => !c.negated && c.term.field !== 'venue');
  const venues = collectTerms(q.text).filter((c) => !c.negated && c.term.field === 'venue');
  const params = new URLSearchParams();
  params.set('query', positive.map((c) => c.term.value).join(' '));
  const f = q.filters;
  if (f.yearMin !== undefined || f.yearMax !== undefined) params.set('year', `${f.yearMin ?? ''}-${f.yearMax ?? ''}`);
  if (venues.length === 1) params.set('venue', venues[0].term.value);
  if (f.openAccess) params.set('openAccessPdf', '');
  const types = [...new Set(f.types.map((t) => TYPE_MAP[t]).filter(Boolean))];
  if (types.length) params.set('publicationTypes', types.join(','));
  if (f.publishers.length) warnings.push('Semantic Scholar は出版社で絞り込めないため、取得後に DOI で判定します');
  params.set('limit', String(Math.min(100, opts.limit * 2)));
  params.set('fields', S2_FIELDS);
  return { url: `${BASE}?${params.toString()}`, warnings, approximate: true };
}

export interface S2Paper {
  paperId: string;
  externalIds?: { DOI?: string; ArXiv?: string; PubMed?: string; DBLP?: string; CorpusId?: number } | null;
  title?: string | null;
  abstract?: string | null;
  year?: number | null;
  venue?: string | null;
  authors?: Array<{ name?: string | null }> | null;
  citationCount?: number | null;
  openAccessPdf?: { url?: string | null } | null;
  publicationTypes?: string[] | null;
  s2FieldsOfStudy?: Array<{ category: string }> | null;
  url?: string | null;
  journal?: { name?: string | null } | null;
}

export function normalizeS2Paper(p: S2Paper): Paper {
  const doi = normalizeDoi(p.externalIds?.DOI);
  const arxiv = normalizeArxivId(p.externalIds?.ArXiv) ?? arxivIdFromDoi(doi);
  return makePaper({
    title: p.title ?? '',
    authors: (p.authors ?? []).map((a) => a.name ?? '').filter(Boolean),
    year: p.year ?? 0,
    venue: p.journal?.name || p.venue || '',
    abstract: p.abstract ?? '',
    ids: {
      doi,
      arxiv,
      s2: p.paperId,
      pmid: p.externalIds?.PubMed,
      dblp: p.externalIds?.DBLP,
    },
    url: p.url ?? undefined,
    pdfUrl: p.openAccessPdf?.url || undefined,
    citationCount: p.citationCount ?? undefined,
    keywords: [...new Set((p.s2FieldsOfStudy ?? []).map((f) => f.category))],
    publisher: publisherFromDoi(doi),
    type: p.publicationTypes?.[0],
    sources: ['semanticscholar'],
  });
}

interface S2SearchResponse {
  total?: number;
  data?: S2Paper[];
}

export function s2Headers(apiKey: string | undefined): Record<string, string> {
  return apiKey ? { 'x-api-key': apiKey } : {};
}

export const semanticScholarSource: SourceAdapter = {
  name: 'semanticscholar',
  label: 'Semantic Scholar',
  status: (config) =>
    config.semanticScholarApiKey
      ? { enabled: true }
      : { enabled: true, reason: 'APIキーなし（混雑時は 429 で結果が返らないことがあります）', reasonEn: 'No API key (may return 429 and no results when busy)' },
  async search(query, opts, ctx): Promise<SourceResult> {
    const req = compileSemanticScholar(query, opts);
    if (!new URL(req.url).searchParams.get('query')) {
      return { papers: [], warnings: ['Semantic Scholar は検索語が必要です'], approximate: true };
    }
    const { data } = await ctx.http.getJson<S2SearchResponse>('semanticscholar', req.url, {
      headers: s2Headers(ctx.config.semanticScholarApiKey),
      signal: ctx.signal,
      // Without a key the shared pool is often exhausted; fail fast instead of stalling the search.
      retries: ctx.config.semanticScholarApiKey ? 3 : 1,
    });
    return {
      papers: (data.data ?? []).map(normalizeS2Paper).filter((p) => p.title),
      total: data.total,
      warnings: req.warnings,
      approximate: req.approximate,
    };
  },
};
