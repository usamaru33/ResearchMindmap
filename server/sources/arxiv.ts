import { normalizeArxivId, normalizeDoi } from '../../shared/ids';
import { makePaper } from '../../shared/paper';
import { publisherFromDoi, type ParsedQuery, type QueryNode, type TermNode } from '../../shared/query';
import type { Paper } from '../../shared/types';
import { asArray, parseXml, textOf } from '../infra/xml';
import { conjuncts } from './queryParts';
import type { CompiledRequest } from './openalex';
import type { SourceAdapter, SourceResult } from './types';

const BASE = 'https://export.arxiv.org/api/query';

const FIELD_PREFIX: Record<TermNode['field'], string[]> = {
  all: ['all'],
  title: ['ti'],
  abstract: ['abs'],
  tiab: ['ti', 'abs'],
  author: ['au'],
  venue: ['jr'],
  keyword: ['all'],
};

function renderTerm(t: TermNode): string {
  const v = t.value.replace(/"/g, '');
  const body = t.phrase || /\s/.test(v) ? `"${v}"` : v;
  const prefixes = FIELD_PREFIX[t.field];
  const parts = prefixes.map((p) => `${p}:${body}`);
  return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`;
}

interface Rendered {
  text: string;
  approximate: boolean;
}

// arXiv only has a binary ANDNOT, so NOT must hang off a positive AND chain.
function render(node: QueryNode, nested: boolean): Rendered {
  switch (node.type) {
    case 'term':
      return { text: renderTerm(node), approximate: node.wildcard || node.field === 'keyword' };
    case 'not':
      // A NOT outside an AND chain cannot be expressed: broaden and filter locally.
      return { text: '', approximate: true };
    case 'or': {
      const parts = node.children.map((c) => render(c, true));
      const texts = parts.map((p) => p.text).filter(Boolean);
      const approximate = parts.some((p) => p.approximate) || texts.length < parts.length;
      if (texts.length < parts.length) return { text: '', approximate: true };
      const s = texts.join(' OR ');
      return { text: nested ? `(${s})` : s, approximate };
    }
    case 'and': {
      const pos = node.children.filter((c) => c.type !== 'not').map((c) => render(c, true));
      const neg = node.children.filter((c): c is Extract<QueryNode, { type: 'not' }> => c.type === 'not').map((c) => render(c.child, true));
      const posTexts = pos.map((p) => p.text).filter(Boolean);
      if (posTexts.length === 0) return { text: '', approximate: true };
      let s = posTexts.join(' AND ');
      for (const n of neg) if (n.text) s += ` ANDNOT ${n.text}`;
      const approximate = [...pos, ...neg].some((p) => p.approximate) || posTexts.length < pos.length;
      return { text: nested ? `(${s})` : s, approximate };
    }
  }
}

function stamp(year: number, end: boolean): string {
  return end ? `${year}12312359` : `${year}01010000`;
}

export function compileArxiv(q: ParsedQuery, opts: { limit: number }): CompiledRequest & { skip?: string } {
  const warnings: string[] = [];
  const f = q.filters;
  if (f.publishers.length && !f.publishers.includes('arxiv')) {
    return { url: '', warnings: [], approximate: false, skip: '出版社が指定されているため arXiv は検索しません' };
  }
  const parts = conjuncts(q.text);
  const rendered = q.text ? render(parts.length === 1 ? parts[0] : { type: 'and', children: parts }, false) : { text: '', approximate: false };
  let approximate = rendered.approximate;
  let search = rendered.text;
  if (!search) {
    return { url: '', warnings: [], approximate: true, skip: 'arXiv では表現できない検索式です' };
  }
  if (approximate) warnings.push('arXiv で表現できない条件（単独の NOT、ワイルドカード等）は取得後に絞り込みます');
  if (f.yearMin !== undefined || f.yearMax !== undefined) {
    const from = stamp(f.yearMin ?? 1991, false);
    const to = stamp(f.yearMax ?? 2100, true);
    search = `(${search}) AND submittedDate:[${from} TO ${to}]`;
  }
  if (f.types.length) approximate = true;
  const params = new URLSearchParams({
    search_query: search,
    start: '0',
    max_results: String(Math.min(100, approximate ? opts.limit * 2 : opts.limit)),
    sortBy: 'relevance',
    sortOrder: 'descending',
  });
  return { url: `${BASE}?${params.toString()}`, warnings, approximate };
}

interface AtomEntry {
  id: string;
  title: unknown;
  summary: unknown;
  published?: string;
  author?: Array<{ name: unknown; 'arxiv:affiliation'?: unknown }>;
  link?: Array<{ '@_href': string; '@_type'?: string; '@_title'?: string; '@_rel'?: string }>;
  category?: Array<{ '@_term': string }>;
  'arxiv:doi'?: unknown;
  'arxiv:journal_ref'?: unknown;
}

export function parseArxivFeed(xml: string): { total: number; entries: AtomEntry[] } {
  const doc = parseXml(xml, ['entry', 'author', 'link', 'category']) as {
    feed?: { entry?: AtomEntry[]; 'opensearch:totalResults'?: unknown };
  };
  return {
    total: Number(textOf(doc.feed?.['opensearch:totalResults'])) || 0,
    entries: doc.feed?.entry ?? [],
  };
}

export function normalizeArxivEntry(entry: AtomEntry): Paper {
  const arxiv = normalizeArxivId(textOf(entry.id));
  const doi = normalizeDoi(textOf(entry['arxiv:doi']));
  const links = asArray(entry.link);
  const pdf = links.find((l) => l['@_type'] === 'application/pdf' || l['@_title'] === 'pdf')?.['@_href'];
  const abs = links.find((l) => l['@_rel'] === 'alternate')?.['@_href'];
  const journal = textOf(entry['arxiv:journal_ref']);
  return makePaper({
    title: textOf(entry.title),
    authors: asArray(entry.author).map((a) => textOf(a.name)).filter(Boolean),
    belongs: textOf(asArray(entry.author)[0]?.['arxiv:affiliation']),
    year: Number((entry.published ?? '').slice(0, 4)) || 0,
    venue: journal || 'arXiv',
    abstract: textOf(entry.summary),
    ids: { arxiv, doi },
    url: abs ?? (arxiv ? `https://arxiv.org/abs/${arxiv}` : undefined),
    pdfUrl: pdf,
    keywords: asArray(entry.category).map((c) => c['@_term']),
    publisher: publisherFromDoi(doi) ?? 'arxiv',
    type: 'preprint',
    sources: ['arxiv'],
  });
}

export const arxivSource: SourceAdapter = {
  name: 'arxiv',
  label: 'arXiv',
  status: () => ({ enabled: true }),
  async search(query, opts, ctx): Promise<SourceResult> {
    const req = compileArxiv(query, opts);
    if (req.skip) return { papers: [], warnings: [req.skip], approximate: false };
    const { data } = await ctx.http.getText('arxiv', req.url, { signal: ctx.signal, timeoutMs: 20_000 });
    const feed = parseArxivFeed(data);
    return {
      papers: feed.entries.map(normalizeArxivEntry).filter((p) => p.title),
      total: feed.total,
      warnings: req.warnings,
      approximate: req.approximate,
    };
  },
};
