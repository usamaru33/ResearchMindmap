import { normalizeDoi, normalizeOpenAlexId } from '../../shared/ids';
import type { Paper, RecommendReason, RecommendResponse } from '../../shared/types';
import { OPENALEX_SELECT, normalizeOpenAlexWork, type OpenAlexWork } from '../sources/openalex';
import { fetchWorksById, type ExpandContext } from './expand';

const BASE = 'https://api.openalex.org/works';
/** OpenAlex accepts up to 100 values in one OR filter; stay well under the URL limit. */
const BATCH = 50;

export interface SeedInput {
  id: string;
  ids?: { doi?: string; openalex?: string; arxiv?: string };
}

interface SeedLinks {
  id: string;
  referenced_works?: string[];
  related_works?: string[];
}

function withKey(params: URLSearchParams, apiKey?: string): string {
  if (apiKey) params.set('api_key', apiKey);
  return params.toString();
}

/** Reference and related-work lists of the seeds, located by OpenAlex id or DOI (a few batched requests). */
async function seedLinks(seeds: SeedInput[], ctx: ExpandContext): Promise<SeedLinks[]> {
  const byOpenAlex = [...new Set(seeds.map((s) => normalizeOpenAlexId(s.ids?.openalex ?? '')).filter((x): x is string => !!x))];
  const byDoi = [
    ...new Set(
      seeds
        .filter((s) => !s.ids?.openalex)
        .map((s) => normalizeDoi(s.ids?.doi ?? (s.ids?.arxiv ? `10.48550/arxiv.${s.ids.arxiv}` : '')))
        .filter((x): x is string => !!x),
    ),
  ];
  const requests: string[] = [];
  for (let i = 0; i < byOpenAlex.length; i += BATCH) requests.push(`openalex:${byOpenAlex.slice(i, i + BATCH).join('|')}`);
  for (let i = 0; i < byDoi.length; i += BATCH) requests.push(`doi:${byDoi.slice(i, i + BATCH).join('|')}`);
  const out: SeedLinks[] = [];
  for (const filter of requests) {
    const url = `${BASE}?${withKey(new URLSearchParams({ filter, 'per-page': '100', select: 'id,referenced_works,related_works' }), ctx.apiKey)}`;
    const { data } = await ctx.http.getJson<{ results: SeedLinks[] }>('openalex', url, { signal: ctx.signal });
    out.push(...data.results);
  }
  return out;
}

interface Score {
  cocited: number;
  citing: number;
  related: number;
}

const total = (s: Score) => s.cocited + s.citing + 0.5 * s.related;

/**
 * Papers the seed set points to but does not contain:
 * - cited by several seeds (likely foundational work that is missing),
 * - citing several seeds (later work building on the same base),
 * - listed by OpenAlex as related to several seeds.
 * Candidates connected to more seeds rank higher; citation count breaks ties.
 */
export async function recommendPapers(
  seeds: SeedInput[],
  exclude: string[],
  limit: number,
  ctx: ExpandContext,
): Promise<RecommendResponse> {
  const links = await seedLinks(seeds, ctx);
  const seedIds = new Set(links.map((l) => normalizeOpenAlexId(l.id)!).filter(Boolean));
  const skip = new Set([...seedIds, ...exclude.map((e) => normalizeOpenAlexId(e)).filter((e): e is string => !!e)]);
  const scores = new Map<string, Score>();
  const bump = (id: string | null | undefined, key: keyof Score) => {
    if (!id || skip.has(id)) return;
    const s = scores.get(id) ?? { cocited: 0, citing: 0, related: 0 };
    s[key]++;
    scores.set(id, s);
  };
  for (const l of links) {
    for (const r of new Set(l.referenced_works ?? [])) bump(normalizeOpenAlexId(r), 'cocited');
    for (const r of new Set(l.related_works ?? [])) bump(normalizeOpenAlexId(r), 'related');
  }

  // Forward: well-cited works that cite the seeds, counted by how many seeds each cites.
  const fetched = new Map<string, Paper>();
  const seedList = [...seedIds];
  for (let i = 0; i < seedList.length && i < BATCH * 2; i += BATCH) {
    const params = new URLSearchParams({
      filter: `cites:${seedList.slice(i, i + BATCH).join('|')}`,
      sort: 'cited_by_count:desc',
      'per-page': '100',
      select: OPENALEX_SELECT,
    });
    const url = `${BASE}?${withKey(params, ctx.apiKey)}`;
    try {
      const { data } = await ctx.http.getJson<{ results: OpenAlexWork[] }>('openalex', url, { signal: ctx.signal });
      for (const w of data.results) {
        const paper = normalizeOpenAlexWork(w);
        const id = paper.ids?.openalex;
        if (!id || skip.has(id)) continue;
        const cited = (paper.referenceIds ?? []).filter((r) => seedIds.has(r)).length;
        const s = scores.get(id) ?? { cocited: 0, citing: 0, related: 0 };
        s.citing = Math.max(s.citing, cited);
        scores.set(id, s);
        fetched.set(id, paper);
      }
    } catch {
      // Forward links are a bonus; keep the backward and related candidates.
    }
  }

  // With several seeds, a single link is weak evidence; ask for at least two.
  const minScore = seedIds.size >= 3 ? 1.5 : 0.5;
  const ranked = [...scores].filter(([, s]) => total(s) >= minScore).sort((a, b) => total(b[1]) - total(a[1]));
  const top = ranked.slice(0, limit * 2);
  const missing = top.map(([id]) => id).filter((id) => !fetched.has(id));
  if (missing.length) for (const p of await fetchWorksById(missing, ctx)) if (p.ids?.openalex) fetched.set(p.ids.openalex, p);

  const reasons: Record<string, RecommendReason> = {};
  const papers = top
    .filter(([id]) => fetched.has(id))
    .sort((a, b) => total(b[1]) - total(a[1]) || (fetched.get(b[0])!.citationCount ?? 0) - (fetched.get(a[0])!.citationCount ?? 0))
    .slice(0, limit)
    .map(([id, s]) => {
      const paper = fetched.get(id)!;
      reasons[paper.id] = { ...s };
      return paper;
    });
  return { papers, reasons, seeds: seedIds.size, candidates: scores.size };
}
