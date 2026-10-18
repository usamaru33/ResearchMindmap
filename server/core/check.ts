import { asciiFamily } from '../../shared/biblio/names';
import { normalizeDoi, normalizeOpenAlexId, normalizeTitle } from '../../shared/ids';
import type { CheckInput, CheckResponse, Paper } from '../../shared/types';
import { OPENALEX_SELECT, normalizeOpenAlexWork, type OpenAlexWork } from '../sources/openalex';
import type { ExpandContext } from './expand';
import { similarity } from './resolve';

const BASE = 'https://api.openalex.org/works';
const BATCH = 50;
/** Published-version lookups are one search each: cap them per check. */
export const PREPRINT_LIMIT = 30;

function url(params: Record<string, string>, apiKey?: string): string {
  const p = new URLSearchParams(params);
  if (apiKey) p.set('api_key', apiKey);
  return `${BASE}?${p}`;
}

function isPreprint(p: CheckInput): boolean {
  const arxivOnly = !!p.ids?.arxiv && (!p.ids.doi || p.ids.doi.startsWith('10.48550/'));
  return p.type === 'preprint' || p.type === 'posted-content' || arxivOnly || /^arxiv/i.test(p.venue ?? '');
}

/** Ids of papers OpenAlex marks as retracted, looked up by OpenAlex id or DOI in batches. */
async function retracted(papers: CheckInput[], ctx: ExpandContext): Promise<{ ids: string[]; checked: number }> {
  const byOpenAlex = new Map<string, string>();
  const byDoi = new Map<string, string>();
  for (const p of papers) {
    const oa = normalizeOpenAlexId(p.ids?.openalex ?? '');
    const doi = normalizeDoi(p.ids?.doi ?? (p.ids?.arxiv ? `10.48550/arxiv.${p.ids.arxiv}` : ''));
    if (oa) byOpenAlex.set(oa, p.id);
    else if (doi) byDoi.set(doi, p.id);
  }
  const filters: string[] = [];
  const oaKeys = [...byOpenAlex.keys()];
  const doiKeys = [...byDoi.keys()];
  for (let i = 0; i < oaKeys.length; i += BATCH) filters.push(`openalex:${oaKeys.slice(i, i + BATCH).join('|')}`);
  for (let i = 0; i < doiKeys.length; i += BATCH) filters.push(`doi:${doiKeys.slice(i, i + BATCH).join('|')}`);
  const out = new Set<string>();
  for (const filter of filters) {
    const { data } = await ctx.http.getJson<{ results: Array<{ id: string; doi?: string | null; is_retracted?: boolean }> }>(
      'openalex',
      url({ filter: `${filter},is_retracted:true`, 'per-page': '100', select: 'id,doi,is_retracted' }, ctx.apiKey),
      { signal: ctx.signal },
    );
    for (const w of data.results) {
      if (!w.is_retracted) continue;
      const id = byOpenAlex.get(normalizeOpenAlexId(w.id) ?? '') ?? byDoi.get(normalizeDoi(w.doi) ?? '');
      if (id) out.add(id);
    }
  }
  return { ids: [...out], checked: byOpenAlex.size + byDoi.size };
}

/** The published (non-preprint) record of a preprint: same title, same first author, not earlier. */
export function pickPublished(preprint: CheckInput, candidates: Paper[]): Paper | null {
  const title = normalizeTitle(preprint.title);
  const family = preprint.authors?.[0] ? asciiFamily(preprint.authors[0]).toLowerCase() : '';
  const fits = candidates.filter((c) => {
    if (!c.ids?.doi || c.ids.doi.startsWith('10.48550/') || c.type === 'preprint' || /^arxiv/i.test(c.venue)) return false;
    if (similarity(normalizeTitle(c.title), title) < 0.9) return false;
    if (preprint.year && c.year && c.year < preprint.year - 1) return false;
    return !family || c.authors.some((a) => asciiFamily(a).toLowerCase() === family);
  });
  return fits.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))[0] ?? null;
}

async function publishedVersions(papers: CheckInput[], ctx: ExpandContext): Promise<Record<string, Paper>> {
  const out: Record<string, Paper> = {};
  const targets = papers.filter(isPreprint).slice(0, PREPRINT_LIMIT);
  for (let i = 0; i < targets.length; i += 5) {
    await Promise.all(
      targets.slice(i, i + 5).map(async (p) => {
        const params: Record<string, string> = {
          'search.title': p.title.replace(/[?*|]/g, ' '),
          filter: 'type:!preprint',
          'per-page': '5',
          select: OPENALEX_SELECT,
        };
        const { data } = await ctx.http.getJson<{ results: OpenAlexWork[] }>('openalex', url(params, ctx.apiKey), { signal: ctx.signal });
        const found = pickPublished(p, data.results.map(normalizeOpenAlexWork));
        if (found) out[p.id] = found;
      }),
    );
  }
  return out;
}

/** Retractions and published versions of preprints, from OpenAlex. Either part may fail alone. */
export async function checkPapers(papers: CheckInput[], ctx: ExpandContext): Promise<CheckResponse> {
  const failed: CheckResponse['failed'] = [];
  const [r, published] = await Promise.all([
    retracted(papers, ctx).catch(() => {
      failed.push('retraction');
      return { ids: [], checked: 0 };
    }),
    publishedVersions(papers, ctx).catch(() => {
      failed.push('published');
      return {};
    }),
  ]);
  const preprints = papers.filter(isPreprint).length;
  return {
    retracted: r.ids,
    published,
    checked: { retraction: r.checked, preprints: Math.min(preprints, PREPRINT_LIMIT), preprintTotal: preprints },
    failed,
  };
}
