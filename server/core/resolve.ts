import { normalizeArxivId, normalizeDoi, normalizeOpenAlexId, normalizeTitle } from '../../shared/ids';
import type { Paper, ResolveItem } from '../../shared/types';
import { bestMatch, looksLikeCitation, scoreCandidate, titleGuesses, type CitationScore } from './citation';
import type { HttpClient } from '../infra/http';
import { normalizeArxivEntry, parseArxivFeed } from '../sources/arxiv';
import { CROSSREF_SELECT, normalizeCrossrefItem, type CrossrefItem } from '../sources/crossref';
import { OPENALEX_SELECT, normalizeOpenAlexWork, type OpenAlexWork } from '../sources/openalex';

export type IdentifierKind = 'doi' | 'arxiv' | 'openalex' | 'pmid' | 'title' | 'citation';

export interface ParsedIdentifier {
  kind: IdentifierKind;
  value: string;
}

/** Recognize what a pasted line is: DOI, arXiv id/URL, OpenAlex id/URL, PubMed id/URL, a full reference, or a title. */
export function parseIdentifier(raw: string): ParsedIdentifier | null {
  // Drop list markers ("- ", "1. ", "[3] ") pasted from a reference list.
  const s = raw.trim().replace(/^(?:[-*•]|\d+[.)]|\[\d+\])\s+/, '');
  if (!s) return null;
  const doi = normalizeDoi(s);
  if (doi) {
    const arxiv = doi.match(/^10\.48550\/arxiv\.(.+)$/i);
    return arxiv ? { kind: 'arxiv', value: normalizeArxivId(arxiv[1])! } : { kind: 'doi', value: doi };
  }
  if (/arxiv\.org\/(abs|pdf)\//i.test(s) || /^arxiv:/i.test(s) || /\barxiv[:\s]+(abs\/)?\d{4}\.\d{4,5}/i.test(s) || /^\d{4}\.\d{4,5}(v\d+)?$/.test(s)) {
    const id = normalizeArxivId(s);
    if (id) return { kind: 'arxiv', value: id };
  }
  if (/openalex\.org\/W\d+/i.test(s) || /^W\d{5,}$/i.test(s)) return { kind: 'openalex', value: normalizeOpenAlexId(s)! };
  const pm = s.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i) ?? s.match(/^pmid:?\s*(\d+)$/i);
  if (pm) return { kind: 'pmid', value: pm[1] };
  if (looksLikeCitation(s)) return { kind: 'citation', value: s };
  if (s.length >= 8) return { kind: 'title', value: s };
  return null;
}

export interface ResolveContext {
  http: HttpClient;
  apiKey?: string;
  mailto?: string;
}

const OA = 'https://api.openalex.org/works';

function oaParams(ctx: ResolveContext, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({ select: OPENALEX_SELECT, ...extra });
  if (ctx.apiKey) p.set('api_key', ctx.apiKey);
  return p.toString();
}

async function openAlexByKey(key: string, ctx: ResolveContext): Promise<Paper | null> {
  try {
    const { data } = await ctx.http.getJson<OpenAlexWork>('openalex', `${OA}/${key}?${oaParams(ctx)}`);
    return normalizeOpenAlexWork(data);
  } catch {
    return null;
  }
}

async function crossrefByDoi(doi: string, ctx: ResolveContext): Promise<Paper | null> {
  try {
    const q = ctx.mailto ? `?mailto=${encodeURIComponent(ctx.mailto)}` : '';
    const { data } = await ctx.http.getJson<{ message: CrossrefItem }>('crossref', `https://api.crossref.org/works/${encodeURIComponent(doi)}${q}`);
    return normalizeCrossrefItem(data.message);
  } catch {
    return null;
  }
}

async function arxivById(id: string, ctx: ResolveContext): Promise<Paper | null> {
  try {
    const { data } = await ctx.http.getText('arxiv', `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`);
    const entry = parseArxivFeed(data).entries[0];
    return entry ? normalizeArxivEntry(entry) : null;
  } catch {
    return null;
  }
}

/** Title lookup: among exact (normalized) title matches, the most cited record wins. */
async function byTitle(title: string, ctx: ResolveContext): Promise<Paper | null> {
  const { data } = await ctx.http.getJson<{ results: OpenAlexWork[] }>('openalex', `${OA}?${oaParams(ctx, { 'search.title': title, 'per-page': '10' })}`);
  const wanted = normalizeTitle(title);
  const papers = data.results.map(normalizeOpenAlexWork);
  const exact = papers.filter((p) => normalizeTitle(p.title) === wanted);
  const pool = exact.length ? exact : papers.filter((p) => similarity(normalizeTitle(p.title), wanted) >= 0.85);
  return pool.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))[0] ?? null;
}

// OpenAlex rejects ? and * outside exact search.
const searchText = (s: string) => s.replace(/[?*|]/g, ' ').replace(/\s+/g, ' ').trim();

async function openAlexTitleSearch(title: string, ctx: ResolveContext): Promise<Paper[]> {
  const url = `${OA}?${oaParams(ctx, { 'search.title': searchText(title), 'per-page': '5' })}`;
  const { data } = await ctx.http.getJson<{ results: OpenAlexWork[] }>('openalex', url);
  return data.results.map(normalizeOpenAlexWork);
}

async function crossrefBibliographic(citation: string, ctx: ResolveContext): Promise<Paper[]> {
  const p = new URLSearchParams({ 'query.bibliographic': citation, rows: '5', select: CROSSREF_SELECT });
  if (ctx.mailto) p.set('mailto', ctx.mailto);
  const { data } = await ctx.http.getJson<{ message: { items: CrossrefItem[] } }>('crossref', `https://api.crossref.org/works?${p}`);
  return data.message.items.map(normalizeCrossrefItem);
}

/**
 * A free-text reference: search OpenAlex by the likely title, then Crossref's reference
 * matcher, and keep the candidate whose title, year and first author fit the text.
 */
async function byCitation(citation: string, ctx: ResolveContext): Promise<{ paper: Paper; score: CitationScore } | null> {
  const [first, second] = titleGuesses(citation);
  const candidates: Paper[] = [];
  const tryWith = async (fetcher: () => Promise<Paper[]>) => {
    candidates.push(...(await fetcher().catch(() => [])));
    return bestMatch(citation, candidates);
  };
  let best = first ? await tryWith(() => openAlexTitleSearch(first, ctx)) : null;
  if (best?.score.confidence !== 'high') best = await tryWith(() => crossrefBibliographic(citation, ctx));
  if (best?.score.confidence !== 'high' && second) best = await tryWith(() => openAlexTitleSearch(second, ctx));
  if (!best) return null;
  // Crossref records lack references and topics: use the OpenAlex record when there is one.
  if (!best.paper.ids?.openalex && best.paper.ids?.doi) {
    const richer = await openAlexByKey(`doi:${best.paper.ids.doi}`, ctx);
    if (richer) best = { ...best, paper: richer };
  }
  return best;
}

/** Token-set Jaccard similarity of two normalized titles. */
export function similarity(a: string, b: string): number {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export async function resolveIdentifier(raw: string, ctx: ResolveContext): Promise<ResolveItem> {
  const parsed = parseIdentifier(raw);
  if (!parsed) return { input: raw, ok: false, error: '識別子として読み取れません' };
  let paper: Paper | null = null;
  let confidence: ResolveItem['confidence'];
  // An id inside a pasted reference: check that the record is the cited work, since
  // catalogue records are occasionally wrong; try the next source, then the text itself.
  const cited = (parsed.kind === 'doi' || parsed.kind === 'arxiv') && looksLikeCitation(raw) ? raw : null;
  const pick = async (fetchers: Array<() => Promise<Paper | null>>) => {
    let fallback: Paper | null = null;
    for (const fetch of fetchers) {
      const p = await fetch();
      if (p && (!cited || scoreCandidate(cited, p).confidence)) return p;
      fallback ??= p;
    }
    if (!cited) return fallback;
    const match = await byCitation(cited, ctx);
    if (match) {
      confidence = match.score.confidence ?? undefined;
      return match.paper;
    }
    if (fallback) confidence = 'low';
    return fallback;
  };
  try {
    switch (parsed.kind) {
      case 'doi':
        paper = await pick([() => openAlexByKey(`doi:${parsed.value}`, ctx), () => crossrefByDoi(parsed.value, ctx)]);
        break;
      case 'arxiv': {
        paper = await pick([() => openAlexByKey(`doi:10.48550/arxiv.${parsed.value}`, ctx), () => arxivById(parsed.value, ctx)]);
        // OpenAlex may report the work under another DOI; keep the arXiv id the user gave
        // so it still matches the same paper elsewhere.
        if (paper) paper = { ...paper, ids: { ...paper.ids, arxiv: parsed.value } };
        break;
      }
      case 'openalex':
        paper = await openAlexByKey(parsed.value, ctx);
        break;
      case 'pmid':
        paper = await openAlexByKey(`pmid:${parsed.value}`, ctx);
        break;
      case 'title':
        paper = await byTitle(parsed.value, ctx);
        break;
      case 'citation': {
        const match = await byCitation(parsed.value, ctx);
        paper = match?.paper ?? null;
        confidence = match?.score.confidence ?? undefined;
        break;
      }
    }
  } catch (err) {
    return { input: raw, kind: parsed.kind, ok: false, error: (err as Error).message };
  }
  return paper
    ? { input: raw, kind: parsed.kind, ok: true, paper, ...(confidence ? { confidence } : {}) }
    : { input: raw, kind: parsed.kind, ok: false, error: '見つかりませんでした' };
}
