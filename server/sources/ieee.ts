import { normalizeDoi } from '../../shared/ids';
import { makePaper, plainText } from '../../shared/paper';
import type { ParsedQuery, QueryNode, TermNode } from '../../shared/query';
import type { Paper } from '../../shared/types';
import { conjuncts } from './queryParts';
import type { CompiledRequest } from './openalex';
import type { SourceAdapter, SourceResult } from './types';

const BASE = 'https://ieeexploreapi.ieee.org/api/v1/search/articles';

// IEEE Xplore query-text field names.
const FIELD: Record<TermNode['field'], string | null> = {
  all: null,
  title: 'Document Title',
  abstract: 'Abstract',
  tiab: null,
  author: 'Authors',
  venue: 'Publication Title',
  keyword: 'Author Keywords',
};

function renderTerm(t: TermNode): string {
  const v = t.value.replace(/"/g, '');
  const body = `${t.phrase || /\s/.test(v) ? `"${v}"` : v}${t.wildcard ? '*' : ''}`;
  if (t.field === 'tiab') return `("Document Title":${body} OR "Abstract":${body})`;
  const field = FIELD[t.field];
  return field ? `"${field}":${body}` : body;
}

function render(node: QueryNode, nested: boolean): string {
  switch (node.type) {
    case 'term':
      return renderTerm(node);
    case 'not':
      return `NOT ${render(node.child, true)}`;
    case 'and':
    case 'or': {
      const s = node.children.map((c) => render(c, true)).join(node.type === 'and' ? ' AND ' : ' OR ');
      return nested ? `(${s})` : s;
    }
  }
}

const CONTENT_TYPES: Record<string, string> = {
  article: 'Journals',
  journal: 'Journals',
  'journal-article': 'Journals',
  conference: 'Conferences',
  proceedings: 'Conferences',
  'proceedings-article': 'Conferences',
  book: 'Books',
  standard: 'Standards',
};

export function compileIeee(q: ParsedQuery, opts: { limit: number; apiKey: string }): CompiledRequest & { skip?: string } {
  const f = q.filters;
  if (f.publishers.length && !f.publishers.includes('ieee')) {
    return { url: '', warnings: [], approximate: false, skip: 'IEEE 以外の出版社が指定されているため IEEE Xplore は検索しません' };
  }
  const params = new URLSearchParams();
  const parts = conjuncts(q.text);
  if (q.text) params.set('querytext', render(parts.length === 1 ? parts[0] : { type: 'and', children: parts }, false));
  if (f.yearMin !== undefined) params.set('start_year', String(f.yearMin));
  if (f.yearMax !== undefined) params.set('end_year', String(f.yearMax));
  if (f.openAccess) params.set('open_access', 'True');
  const type = f.types.map((t) => CONTENT_TYPES[t]).find(Boolean);
  if (type) params.set('content_type', type);
  params.set('max_records', String(Math.min(200, opts.limit)));
  params.set('sort_field', 'relevance');
  params.set('format', 'json');
  params.set('apikey', opts.apiKey);
  return { url: `${BASE}?${params.toString()}`, warnings: [], approximate: f.types.length > 1 };
}

export interface IeeeArticle {
  doi?: string;
  title?: string;
  publisher?: string;
  content_type?: string;
  abstract?: string;
  article_number?: string;
  pdf_url?: string;
  html_url?: string;
  abstract_url?: string;
  publication_title?: string;
  publication_year?: number | string;
  citing_paper_count?: number;
  access_type?: string;
  authors?: { authors?: Array<{ full_name?: string; affiliation?: string }> };
  index_terms?: {
    ieee_terms?: { terms?: string[] };
    author_terms?: { terms?: string[] };
  };
}

export function normalizeIeeeArticle(a: IeeeArticle): Paper {
  const doi = normalizeDoi(a.doi);
  const authors = a.authors?.authors ?? [];
  const keywords = [...(a.index_terms?.author_terms?.terms ?? []), ...(a.index_terms?.ieee_terms?.terms ?? [])];
  return makePaper({
    title: plainText(a.title),
    authors: authors.map((x) => x.full_name ?? '').filter(Boolean),
    belongs: authors[0]?.affiliation ?? '',
    year: Number(a.publication_year) || 0,
    venue: a.publication_title ?? '',
    abstract: plainText(a.abstract),
    ids: { doi, ieee: a.article_number },
    url: a.html_url ?? a.abstract_url ?? (doi ? `https://doi.org/${doi}` : undefined),
    // Only advertise the PDF when it is actually free to read.
    pdfUrl: a.access_type === 'OPEN_ACCESS' ? a.pdf_url : undefined,
    citationCount: a.citing_paper_count,
    keywords: [...new Set(keywords)],
    publisher: 'ieee',
    type: a.content_type === 'Conferences' ? 'proceedings-article' : a.content_type === 'Journals' ? 'journal-article' : a.content_type?.toLowerCase(),
    sources: ['ieee'],
  });
}

interface IeeeResponse {
  total_records?: number;
  articles?: IeeeArticle[];
}

export const ieeeSource: SourceAdapter = {
  name: 'ieee',
  label: 'IEEE Xplore',
  status: (config) =>
    config.ieeeApiKey ? { enabled: true } : { enabled: false, reason: 'IEEE_API_KEY が未設定（IEEE の論文は OpenAlex / Crossref から取得します）' },
  async search(query, opts, ctx): Promise<SourceResult> {
    const apiKey = ctx.config.ieeeApiKey;
    if (!apiKey) return { papers: [], warnings: ['IEEE_API_KEY が未設定です'], approximate: false };
    const req = compileIeee(query, { limit: opts.limit, apiKey });
    if (req.skip) return { papers: [], warnings: [req.skip], approximate: false };
    const { data } = await ctx.http.getJson<IeeeResponse>('ieee', req.url, { signal: ctx.signal });
    return {
      papers: (data.articles ?? []).map(normalizeIeeeArticle).filter((p) => p.title),
      total: data.total_records,
      warnings: req.warnings,
      approximate: req.approximate,
    };
  },
};
