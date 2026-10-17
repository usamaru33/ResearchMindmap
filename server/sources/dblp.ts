import { arxivIdFromDoi, normalizeArxivId, normalizeDoi } from '../../shared/ids';
import { makePaper } from '../../shared/paper';
import { collectTerms, publisherFromDoi, type ParsedQuery } from '../../shared/query';
import type { Paper } from '../../shared/types';
import { asArray } from '../infra/xml';
import type { CompiledRequest } from './openalex';
import type { SourceAdapter, SourceResult } from './types';

const BASE = 'https://dblp.org/search/publ/api';

/**
 * dblp search is prefix-matched AND over words, with `|` for OR inside a
 * group. Only positive terms are sent; everything else is checked locally.
 */
export function compileDblp(q: ParsedQuery, opts: { limit: number }): CompiledRequest {
  const words = collectTerms(q.text)
    .filter((c) => !c.negated)
    .map((c) => c.term.value)
    .join(' ');
  const params = new URLSearchParams({ q: words, format: 'json', h: String(Math.min(100, opts.limit * 2)) });
  return { url: `${BASE}?${params.toString()}`, warnings: [], approximate: true };
}

interface DblpInfo {
  authors?: { author?: { text: string } | Array<{ text: string }> };
  title?: string;
  venue?: string | string[];
  year?: string;
  type?: string;
  key?: string;
  doi?: string;
  ee?: string | string[];
  url?: string;
}

// dblp disambiguates homonyms with a 4-digit suffix ("Jane Doe 0001").
const stripHomonym = (name: string) => name.replace(/\s+\d{4}$/, '');

export function normalizeDblpHit(info: DblpInfo): Paper {
  const ee = asArray(info.ee);
  const doi = normalizeDoi(info.doi) ?? ee.map((e) => normalizeDoi(e)).find(Boolean);
  const arxiv = arxivIdFromDoi(doi) ?? ee.map((e) => (e.includes('arxiv.org') ? normalizeArxivId(e) : undefined)).find(Boolean);
  const type = info.type?.startsWith('Conference')
    ? 'proceedings-article'
    : info.type?.startsWith('Journal')
      ? 'journal-article'
      : info.type?.toLowerCase();
  return makePaper({
    title: (info.title ?? '').replace(/\.$/, ''),
    authors: asArray(info.authors?.author).map((a) => stripHomonym(a.text)),
    year: Number(info.year) || 0,
    venue: asArray(info.venue).join(' '),
    ids: { doi, arxiv, dblp: info.key },
    url: ee[0] ?? info.url,
    publisher: publisherFromDoi(doi),
    type,
    sources: ['dblp'],
  });
}

interface DblpResponse {
  result?: { hits?: { '@total'?: string; hit?: Array<{ info: DblpInfo }> } };
}

export const dblpSource: SourceAdapter = {
  name: 'dblp',
  label: 'dblp',
  status: (config) =>
    config.enableDblp
      ? { enabled: true, reason: 'ボット対策で弾かれることがあります（失敗しても他のソースは続行）' }
      : { enabled: false, reason: 'ENABLE_DBLP=true で有効化（ボット対策で弾かれることがあるため既定は無効）' },
  async search(query, opts, ctx): Promise<SourceResult> {
    const req = compileDblp(query, opts);
    if (!new URL(req.url).searchParams.get('q')) return { papers: [], warnings: ['dblp は検索語が必要です'], approximate: true };
    const { data } = await ctx.http.getJson<DblpResponse>('dblp', req.url, { signal: ctx.signal, retries: 1 });
    const hits = data.result?.hits;
    return {
      papers: (hits?.hit ?? []).map((h) => normalizeDblpHit(h.info)).filter((p) => p.title),
      total: Number(hits?.['@total'] ?? 0),
      warnings: req.warnings,
      approximate: req.approximate,
    };
  },
};
