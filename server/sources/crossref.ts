import { arxivIdFromDoi, normalizeDoi } from '../../shared/ids';
import { makePaper, plainText } from '../../shared/paper';
import { PUBLISHER_DOI_PREFIXES, collectTerms, publisherFromDoi, type ParsedQuery } from '../../shared/query';
import type { Paper } from '../../shared/types';
import { hasBooleanStructure } from './queryParts';
import type { CompiledRequest } from './openalex';
import type { SourceAdapter, SourceResult } from './types';

const BASE = 'https://api.crossref.org/works';
const SELECT = [
  'DOI',
  'title',
  'author',
  'issued',
  'container-title',
  'abstract',
  'is-referenced-by-count',
  'type',
  'publisher',
  'URL',
  'subject',
  'event',
].join(',');

const TYPE_MAP: Record<string, string> = {
  article: 'journal-article',
  journal: 'journal-article',
  'journal-article': 'journal-article',
  conference: 'proceedings-article',
  proceedings: 'proceedings-article',
  'proceedings-article': 'proceedings-article',
  preprint: 'posted-content',
  'book-chapter': 'book-chapter',
  book: 'book',
  dissertation: 'dissertation',
};

/** Crossref has no boolean search: send positive words as bag-of-words, filter the rest locally. */
export function compileCrossref(q: ParsedQuery, opts: { limit: number; mailto?: string }): CompiledRequest {
  const warnings: string[] = [];
  const positive = collectTerms(q.text).filter((c) => !c.negated);
  const biblio = positive.filter((c) => !['author', 'venue'].includes(c.term.field)).map((c) => c.term.value);
  const authors = positive.filter((c) => c.term.field === 'author').map((c) => c.term.value);
  const venues = positive.filter((c) => c.term.field === 'venue').map((c) => c.term.value);

  if (q.text && hasBooleanStructure(q.text)) {
    warnings.push('Crossref はブール演算・フレーズに対応していないため、語を並べて検索してから条件で絞り込みます');
  }

  const params = new URLSearchParams();
  if (biblio.length) params.set('query.bibliographic', biblio.join(' '));
  if (authors.length) params.set('query.author', authors.join(' '));
  if (venues.length) params.set('query.container-title', venues.join(' '));

  const filters: string[] = [];
  const f = q.filters;
  if (f.yearMin !== undefined) filters.push(`from-pub-date:${f.yearMin}`);
  if (f.yearMax !== undefined) filters.push(`until-pub-date:${f.yearMax}`);
  for (const pub of f.publishers) {
    const prefix = PUBLISHER_DOI_PREFIXES[pub];
    if (prefix) filters.push(`prefix:${prefix}`);
    else warnings.push(`出版社「${pub}」の DOI プレフィックスが不明なため、Crossref では絞り込めません`);
  }
  for (const t of f.types) {
    if (TYPE_MAP[t]) filters.push(`type:${TYPE_MAP[t]}`);
  }
  if (f.openAccess) warnings.push('Crossref はオープンアクセスで絞り込めないため、取得後に判定します');
  if (filters.length) params.set('filter', filters.join(','));

  params.set('rows', String(Math.min(100, opts.limit * 2)));
  params.set('select', SELECT);
  if (opts.mailto) params.set('mailto', opts.mailto);
  return { url: `${BASE}?${params.toString()}`, warnings, approximate: true };
}

interface CrossrefDateParts {
  'date-parts'?: number[][];
}

export interface CrossrefItem {
  DOI: string;
  title?: string[];
  author?: Array<{ given?: string; family?: string; name?: string; affiliation?: Array<{ name?: string }> }>;
  issued?: CrossrefDateParts;
  'container-title'?: string[];
  abstract?: string;
  'is-referenced-by-count'?: number;
  type?: string;
  publisher?: string;
  URL?: string;
  subject?: string[];
  event?: { name?: string };
}

export function normalizeCrossrefItem(item: CrossrefItem): Paper {
  const doi = normalizeDoi(item.DOI);
  const authors = (item.author ?? [])
    .map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(' '))
    .filter(Boolean);
  const abstract = plainText(item.abstract).replace(/^abstract\s*[:.]?\s*/i, '');
  return makePaper({
    title: plainText(item.title?.[0]),
    authors,
    belongs: item.author?.[0]?.affiliation?.[0]?.name ?? '',
    year: item.issued?.['date-parts']?.[0]?.[0] ?? 0,
    venue: plainText(item['container-title']?.[0] ?? item.event?.name ?? ''),
    abstract,
    ids: { doi, arxiv: arxivIdFromDoi(doi) },
    url: doi ? `https://doi.org/${doi}` : item.URL,
    citationCount: item['is-referenced-by-count'],
    keywords: item.subject,
    publisher: publisherFromDoi(doi) ?? item.publisher,
    type: item.type,
    sources: ['crossref'],
  });
}

interface CrossrefList {
  message: { 'total-results': number; items: CrossrefItem[] };
}

export const crossrefSource: SourceAdapter = {
  name: 'crossref',
  label: 'Crossref',
  status: () => ({ enabled: true }),
  async search(query, opts, ctx): Promise<SourceResult> {
    if (!query.text && query.filters.publishers.length === 0) {
      return { papers: [], warnings: ['Crossref は検索語が必要です'], approximate: true };
    }
    const req = compileCrossref(query, { limit: opts.limit, mailto: ctx.config.crossrefMailto });
    const { data } = await ctx.http.getJson<CrossrefList>('crossref', req.url, { signal: ctx.signal });
    return {
      papers: data.message.items.map(normalizeCrossrefItem).filter((p) => p.title),
      total: data.message['total-results'],
      warnings: req.warnings,
      approximate: req.approximate,
    };
  },
};
