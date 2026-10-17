import { arxivIdFromDoi, normalizeDoi, normalizeOpenAlexId } from '../../shared/ids';
import { makePaper } from '../../shared/paper';
import { publisherFromDoi, type ParsedQuery, type QueryNode, type TextField } from '../../shared/query';
import type { Paper, Topic } from '../../shared/types';
import { conjuncts, fieldsUsed, hasWildcard, quoted, renderBoolean } from './queryParts';
import type { SourceAdapter, SourceResult } from './types';

const BASE = 'https://api.openalex.org/works';

export const OPENALEX_SELECT = [
  'id',
  'doi',
  'title',
  'display_name',
  'publication_year',
  'authorships',
  'primary_location',
  'best_oa_location',
  'open_access',
  'abstract_inverted_index',
  'cited_by_count',
  'referenced_works',
  'primary_topic',
  'topics',
  'keywords',
  'type',
  'ids',
  'language',
].join(',');

// Publishers whose OpenAlex records reliably carry a host organization.
// ACM conference proceedings often do not, so ACM is filtered locally by DOI prefix.
const PUBLISHER_IDS: Record<string, string> = {
  ieee: 'P4310319808',
};

const SEARCH_PARAM: Partial<Record<TextField, string>> = {
  all: 'search',
  title: 'search.title',
  tiab: 'search.title_abstract_keywords',
  keyword: 'search.title_abstract_keywords',
  abstract: 'search.title_and_abstract',
};

function booleanText(node: QueryNode): string {
  // OpenAlex matches whole (stemmed) words; a trailing * is not supported.
  return renderBoolean(node, (t) => quoted(t));
}

export interface CompiledRequest {
  url: string;
  warnings: string[];
  approximate: boolean;
}

export function compileOpenAlex(
  q: ParsedQuery,
  opts: { limit: number; apiKey?: string },
): CompiledRequest {
  const warnings: string[] = [];
  let approximate = false;
  const buckets = new Map<string, QueryNode[]>();
  const filters: string[] = [];

  const add = (param: string, node: QueryNode) => {
    const list = buckets.get(param) ?? [];
    list.push(node);
    buckets.set(param, list);
  };

  for (const part of conjuncts(q.text)) {
    const fields = [...fieldsUsed(part)];
    const field = fields.length === 1 ? fields[0] : null;
    if (hasWildcard(part)) {
      approximate = true;
      if (!warnings.some((w) => w.includes('ワイルドカード'))) {
        warnings.push('OpenAlex はワイルドカード（*）に対応していないため、語幹で検索して取得後に絞り込みます');
      }
    }
    if (field === 'author') {
      if (part.type === 'term') {
        filters.push(`raw_author_name.search:${part.value.replace(/[,|]/g, ' ')}`);
      } else {
        approximate = true;
        warnings.push('OpenAlex では著者の OR / NOT を直接指定できないため、取得後に絞り込みます');
      }
      continue;
    }
    if (field === 'venue') {
      approximate = true;
      warnings.push('OpenAlex は掲載先名で絞り込めないため、取得後に絞り込みます');
      continue;
    }
    if (field && SEARCH_PARAM[field]) {
      if (field === 'keyword' || field === 'abstract') approximate = true;
      add(SEARCH_PARAM[field]!, part);
      continue;
    }
    // Mixed fields inside one OR/NOT group: search all fields, refine locally.
    approximate = true;
    if (!warnings.some((w) => w.includes('異なるフィールド'))) {
      warnings.push('異なるフィールドを OR でまとめた条件は、全項目で検索してから絞り込みます');
    }
    add('search', part);
  }

  const f = q.filters;
  if (f.yearMin !== undefined && f.yearMax !== undefined) filters.push(`publication_year:${f.yearMin}-${f.yearMax}`);
  else if (f.yearMin !== undefined) filters.push(`publication_year:>${f.yearMin - 1}`);
  else if (f.yearMax !== undefined) filters.push(`publication_year:<${f.yearMax + 1}`);
  if (f.openAccess !== undefined) filters.push(`is_oa:${f.openAccess}`);
  if (f.languages.length) filters.push(`language:${f.languages.join('|')}`);
  if (f.types.length) {
    approximate = true; // OpenAlex classifies conference papers as "article"; check locally.
  }
  if (f.publishers.length) {
    const ids = f.publishers.map((p) => PUBLISHER_IDS[p]);
    if (ids.every(Boolean)) {
      filters.push(`primary_location.source.host_organization_lineage:${ids.join('|')}`);
    } else {
      approximate = true;
    }
  }

  const params = new URLSearchParams();
  for (const [param, nodes] of buckets) {
    params.set(param, booleanText(nodes.length === 1 ? nodes[0] : { type: 'and', children: nodes }));
  }
  if (filters.length) params.set('filter', filters.join(','));
  // Fetch extra when results will be post-filtered, so enough survive.
  params.set('per-page', String(Math.min(100, approximate ? opts.limit * 2 : opts.limit)));
  params.set('select', OPENALEX_SELECT);
  if (opts.apiKey) params.set('api_key', opts.apiKey);
  return { url: `${BASE}?${params.toString()}`, warnings, approximate };
}

// ---- normalization --------------------------------------------------------

interface OpenAlexSource {
  display_name?: string | null;
  host_organization_name?: string | null;
}

interface OpenAlexLocation {
  landing_page_url?: string | null;
  pdf_url?: string | null;
  source?: OpenAlexSource | null;
}

interface OpenAlexTopic {
  id: string;
  display_name: string;
  score?: number;
  subfield?: { id: string; display_name: string };
  field?: { id: string; display_name: string };
  domain?: { id: string; display_name: string };
}

export interface OpenAlexWork {
  id: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  authorships?: Array<{
    author?: { display_name?: string | null } | null;
    raw_author_name?: string | null;
    institutions?: Array<{ display_name?: string | null }>;
  }>;
  primary_location?: OpenAlexLocation | null;
  best_oa_location?: OpenAlexLocation | null;
  open_access?: { is_oa?: boolean; oa_url?: string | null } | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  cited_by_count?: number | null;
  referenced_works?: string[] | null;
  primary_topic?: OpenAlexTopic | null;
  topics?: OpenAlexTopic[] | null;
  keywords?: Array<{ display_name: string }> | null;
  type?: string | null;
  ids?: { pmid?: string | null } | null;
}

export function rebuildAbstract(index: Record<string, number[]> | null | undefined): string {
  if (!index) return '';
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) words[pos] = word;
  }
  return words.filter((w) => w !== undefined).join(' ');
}

function shortId(url: string): string {
  return url.replace(/^https:\/\/openalex\.org\//, '');
}

function topicsOf(work: OpenAlexWork): Topic[] {
  const out: Topic[] = [];
  const seen = new Set<string>();
  const push = (t: Topic) => {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  };
  const all = [work.primary_topic, ...(work.topics ?? [])].filter(Boolean) as OpenAlexTopic[];
  for (const t of all) push({ id: shortId(t.id), name: t.display_name, level: 'topic', score: t.score });
  const primary = work.primary_topic;
  if (primary?.subfield) push({ id: shortId(primary.subfield.id), name: primary.subfield.display_name, level: 'subfield' });
  if (primary?.field) push({ id: shortId(primary.field.id), name: primary.field.display_name, level: 'field' });
  if (primary?.domain) push({ id: shortId(primary.domain.id), name: primary.domain.display_name, level: 'domain' });
  return out;
}

export function normalizeOpenAlexWork(work: OpenAlexWork): Paper {
  const doi = normalizeDoi(work.doi);
  const openalex = normalizeOpenAlexId(work.id);
  const pmid = work.ids?.pmid?.match(/(\d+)$/)?.[1];
  const institutions = (work.authorships ?? [])
    .flatMap((a) => a.institutions ?? [])
    .map((i) => i.display_name)
    .filter((n): n is string => !!n);
  const pdfUrl = work.best_oa_location?.pdf_url ?? (work.open_access?.is_oa ? work.open_access.oa_url : null);
  return makePaper({
    title: work.title ?? work.display_name ?? '',
    authors: (work.authorships ?? [])
      .map((a) => a.author?.display_name ?? a.raw_author_name ?? '')
      .filter(Boolean),
    belongs: [...new Set(institutions)].slice(0, 2).join(' / '),
    year: work.publication_year ?? 0,
    venue: work.primary_location?.source?.display_name ?? '',
    abstract: rebuildAbstract(work.abstract_inverted_index),
    ids: { doi, openalex, pmid, arxiv: arxivIdFromDoi(doi) },
    url: work.primary_location?.landing_page_url ?? (doi ? `https://doi.org/${doi}` : work.id),
    pdfUrl: pdfUrl ?? undefined,
    citationCount: work.cited_by_count ?? undefined,
    referenceIds: (work.referenced_works ?? []).map((r) => normalizeOpenAlexId(r)).filter((r): r is string => !!r),
    topics: topicsOf(work),
    keywords: (work.keywords ?? []).map((k) => k.display_name),
    publisher: publisherFromDoi(doi) ?? work.primary_location?.source?.host_organization_name ?? undefined,
    type: work.type ?? undefined,
    sources: ['openalex'],
  });
}

interface OpenAlexList {
  meta: { count: number };
  results: OpenAlexWork[];
}

export const openAlexSource: SourceAdapter = {
  name: 'openalex',
  label: 'OpenAlex',
  status: (config) =>
    config.openalexApiKey
      ? { enabled: true }
      : { enabled: true, reason: 'APIキーなし（同じ IP の利用者で共有する少ない無料枠で動作）' },
  async search(query, opts, ctx): Promise<SourceResult> {
    const req = compileOpenAlex(query, { limit: opts.limit, apiKey: ctx.config.openalexApiKey });
    const { data } = await ctx.http.getJson<OpenAlexList>('openalex', req.url, { signal: ctx.signal });
    return {
      papers: data.results.map(normalizeOpenAlexWork),
      total: data.meta.count,
      warnings: req.warnings,
      approximate: req.approximate,
    };
  },
};
