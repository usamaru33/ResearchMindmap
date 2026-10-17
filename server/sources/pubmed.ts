import { normalizeDoi } from '../../shared/ids';
import { makePaper } from '../../shared/paper';
import { publisherFromDoi, type ParsedQuery, type QueryNode, type TermNode } from '../../shared/query';
import type { Paper } from '../../shared/types';
import { asArray, parseXml, textOf } from '../infra/xml';
import { conjuncts } from './queryParts';
import type { CompiledRequest } from './openalex';
import type { SourceAdapter, SourceResult } from './types';

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

const TAG: Record<TermNode['field'], string> = {
  all: 'all',
  title: 'ti',
  abstract: 'ab',
  tiab: 'tiab',
  author: 'au',
  venue: 'ta',
  keyword: 'mh',
};

const LANGUAGES: Record<string, string> = {
  en: 'english',
  ja: 'japanese',
  de: 'german',
  fr: 'french',
  es: 'spanish',
  zh: 'chinese',
  ko: 'korean',
};

const TYPES: Record<string, string> = {
  review: 'review',
  article: 'journal article',
  'journal-article': 'journal article',
  trial: 'clinical trial',
  'clinical-trial': 'clinical trial',
  'meta-analysis': 'meta-analysis',
};

function renderTerm(t: TermNode): string {
  const v = t.value.replace(/"/g, '');
  const body = t.phrase || /\s/.test(v) ? `"${v}${t.wildcard ? '*' : ''}"` : `${v}${t.wildcard ? '*' : ''}`;
  return `${body}[${TAG[t.field]}]`;
}

// PubMed's NOT is binary (a NOT b), like arXiv's ANDNOT.
function render(node: QueryNode, nested: boolean): { text: string; approximate: boolean } {
  switch (node.type) {
    case 'term':
      return { text: renderTerm(node), approximate: false };
    case 'not':
      return { text: '', approximate: true };
    case 'or': {
      const parts = node.children.map((c) => render(c, true));
      if (parts.some((p) => !p.text)) return { text: '', approximate: true };
      const s = parts.map((p) => p.text).join(' OR ');
      return { text: nested ? `(${s})` : s, approximate: parts.some((p) => p.approximate) };
    }
    case 'and': {
      const pos = node.children.filter((c) => c.type !== 'not').map((c) => render(c, true));
      const neg = node.children
        .filter((c): c is Extract<QueryNode, { type: 'not' }> => c.type === 'not')
        .map((c) => render(c.child, true));
      const posTexts = pos.map((p) => p.text).filter(Boolean);
      if (!posTexts.length) return { text: '', approximate: true };
      let s = posTexts.join(' AND ');
      for (const n of neg) if (n.text) s += ` NOT ${n.text}`;
      const approximate = [...pos, ...neg].some((p) => p.approximate) || posTexts.length < pos.length;
      return { text: nested ? `(${s})` : s, approximate };
    }
  }
}

export function compilePubmedTerm(q: ParsedQuery): { term: string; warnings: string[]; approximate: boolean } {
  const warnings: string[] = [];
  const parts = conjuncts(q.text);
  const r = q.text ? render(parts.length === 1 ? parts[0] : { type: 'and', children: parts }, false) : { text: '', approximate: false };
  let approximate = r.approximate;
  const clauses = r.text ? [parts.length > 1 || q.text?.type === 'or' ? `(${r.text})` : r.text] : [];
  const f = q.filters;
  if (f.yearMin !== undefined || f.yearMax !== undefined) clauses.push(`${f.yearMin ?? 1800}:${f.yearMax ?? 3000}[dp]`);
  for (const lang of f.languages) clauses.push(`${LANGUAGES[lang] ?? lang}[la]`);
  const types = f.types.map((t) => TYPES[t]).filter(Boolean);
  if (types.length) clauses.push(`(${types.map((t) => `"${t}"[pt]`).join(' OR ')})`);
  if (f.openAccess) clauses.push('"free full text"[sb]');
  if (f.publishers.length) {
    approximate = true;
    warnings.push('PubMed は出版社で絞り込めないため、取得後に DOI で判定します');
  }
  if (r.approximate) warnings.push('PubMed で表現できない条件（単独の NOT 等）は取得後に絞り込みます');
  return { term: clauses.join(' AND '), warnings, approximate };
}

export function compilePubmed(q: ParsedQuery, opts: { limit: number; apiKey?: string; email?: string }): CompiledRequest {
  const { term, warnings, approximate } = compilePubmedTerm(q);
  const params = new URLSearchParams({
    db: 'pubmed',
    term,
    retmax: String(Math.min(100, approximate ? opts.limit * 2 : opts.limit)),
    retmode: 'json',
    sort: 'relevance',
    tool: 'ResearchMindMap',
  });
  if (opts.email) params.set('email', opts.email);
  if (opts.apiKey) params.set('api_key', opts.apiKey);
  return { url: `${EUTILS}/esearch.fcgi?${params.toString()}`, warnings, approximate };
}

export function efetchUrl(ids: string[], opts: { apiKey?: string; email?: string }): string {
  const params = new URLSearchParams({ db: 'pubmed', id: ids.join(','), retmode: 'xml', tool: 'ResearchMindMap' });
  if (opts.email) params.set('email', opts.email);
  if (opts.apiKey) params.set('api_key', opts.apiKey);
  return `${EUTILS}/efetch.fcgi?${params.toString()}`;
}

type XNode = Record<string, unknown>;

function yearOf(pubDate: XNode | undefined): number {
  const y = textOf(pubDate?.Year) || textOf(pubDate?.MedlineDate).slice(0, 4);
  return Number(y) || 0;
}

export function parsePubmedArticles(xml: string): Paper[] {
  const doc = parseXml(xml, ['PubmedArticle', 'Author', 'AbstractText', 'ArticleId', 'ELocationID', 'MeshHeading', 'Keyword', 'AffiliationInfo']) as {
    PubmedArticleSet?: { PubmedArticle?: XNode[] };
  };
  return (doc.PubmedArticleSet?.PubmedArticle ?? []).map((pa) => {
    const citation = pa.MedlineCitation as XNode;
    const article = citation.Article as XNode;
    const pmid = textOf(citation.PMID);
    const authors = asArray((article.AuthorList as XNode | undefined)?.Author as XNode[]).map((a) =>
      textOf(a.CollectiveName) || [textOf(a.ForeName), textOf(a.LastName)].filter(Boolean).join(' '),
    );
    const firstAffiliation = textOf(
      asArray((asArray((article.AuthorList as XNode | undefined)?.Author as XNode[])[0]?.AffiliationInfo) as XNode[])[0]?.Affiliation,
    );
    const abstractParts = asArray((article.Abstract as XNode | undefined)?.AbstractText as unknown[]).map((part) => {
      const label = (part as XNode)?.['@_Label'];
      const body = textOf(part);
      return label ? `${label}: ${body}` : body;
    });
    const articleIds = asArray(((pa.PubmedData as XNode | undefined)?.ArticleIdList as XNode | undefined)?.ArticleId as XNode[]);
    const doiNode =
      asArray(article.ELocationID as XNode[]).find((e) => e['@_EIdType'] === 'doi') ??
      articleIds.find((e) => e['@_IdType'] === 'doi');
    const doi = normalizeDoi(textOf(doiNode));
    const pmc = textOf(articleIds.find((e) => e['@_IdType'] === 'pmc'));
    const journal = article.Journal as XNode;
    const mesh = asArray((citation.MeshHeadingList as XNode | undefined)?.MeshHeading as XNode[]).map((m) => textOf(m.DescriptorName));
    const keywords = asArray((citation.KeywordList as XNode | undefined)?.Keyword as unknown[]).map(textOf);
    return makePaper({
      title: textOf(article.ArticleTitle).replace(/\.$/, ''),
      authors: authors.filter(Boolean),
      belongs: firstAffiliation,
      year: yearOf((journal?.JournalIssue as XNode | undefined)?.PubDate as XNode),
      venue: textOf(journal?.Title),
      abstract: abstractParts.join(' '),
      ids: { doi, pmid },
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      pdfUrl: pmc ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmc}/` : undefined,
      keywords: [...new Set([...keywords, ...mesh].filter(Boolean))],
      publisher: publisherFromDoi(doi),
      type: 'article',
      sources: ['pubmed'],
    });
  });
}

interface ESearchResponse {
  esearchresult?: { count?: string; idlist?: string[]; ERROR?: string };
}

export const pubmedSource: SourceAdapter = {
  name: 'pubmed',
  label: 'PubMed',
  status: () => ({ enabled: true }),
  async search(query, opts, ctx): Promise<SourceResult> {
    if (!query.text) return { papers: [], warnings: ['PubMed は検索語が必要です'], approximate: false };
    const keys = { apiKey: ctx.config.ncbiApiKey, email: ctx.config.crossrefMailto };
    const req = compilePubmed(query, { limit: opts.limit, ...keys });
    const { data } = await ctx.http.getJson<ESearchResponse>('pubmed', req.url, { signal: ctx.signal });
    const ids = data.esearchresult?.idlist ?? [];
    if (ids.length === 0) {
      return { papers: [], total: Number(data.esearchresult?.count ?? 0), warnings: req.warnings, approximate: req.approximate };
    }
    const { data: xml } = await ctx.http.getText('pubmed', efetchUrl(ids, keys), { signal: ctx.signal });
    // efetch does not preserve the relevance order of esearch.
    const byPmid = new Map(parsePubmedArticles(xml).map((p) => [p.ids?.pmid, p]));
    return {
      papers: ids.map((id) => byPmid.get(id)).filter((p): p is Paper => !!p && !!p.title),
      total: Number(data.esearchresult?.count ?? 0),
      warnings: req.warnings,
      approximate: req.approximate,
    };
  },
};
