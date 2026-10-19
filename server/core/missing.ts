import { normalizeDoi, normalizeOpenAlexId } from '../../shared/ids';
import type { MissingCandidate, MissingResponse, Paper } from '../../shared/types';
import { OPENALEX_SELECT, normalizeOpenAlexWork, type OpenAlexWork } from '../sources/openalex';
import { fetchWorksById, type ExpandContext } from './expand';

const BASE = 'https://api.openalex.org/works';
const BATCH = 50;
/** Works citing the map that are read for forward links and co-citation (two pages of 100). */
const CITING_PAGES = 2;

export interface MissingInput {
  id: string;
  ids?: { doi?: string; openalex?: string; arxiv?: string };
}

interface SeedWork {
  id: string;
  doi?: string | null;
  referenced_works?: string[];
}

function withKey(params: URLSearchParams, apiKey?: string): string {
  if (apiKey) params.set('api_key', apiKey);
  return params.toString();
}

/** The map's papers in OpenAlex with their reference lists, keyed back to the map's own ids. */
async function seedWorks(papers: MissingInput[], ctx: ExpandContext): Promise<Map<string, { mapId: string; refs: string[] }>> {
  const byOpenAlex = new Map<string, string>();
  const byDoi = new Map<string, string>();
  for (const p of papers) {
    const oa = normalizeOpenAlexId(p.ids?.openalex ?? '');
    const doi = normalizeDoi(p.ids?.doi ?? (p.ids?.arxiv ? `10.48550/arxiv.${p.ids.arxiv}` : ''));
    if (oa) byOpenAlex.set(oa, p.id);
    else if (doi) byDoi.set(doi, p.id);
  }
  const filters: string[] = [];
  const oaIds = [...byOpenAlex.keys()];
  const dois = [...byDoi.keys()];
  for (let i = 0; i < oaIds.length; i += BATCH) filters.push(`openalex:${oaIds.slice(i, i + BATCH).join('|')}`);
  for (let i = 0; i < dois.length; i += BATCH) filters.push(`doi:${dois.slice(i, i + BATCH).join('|')}`);
  const out = new Map<string, { mapId: string; refs: string[] }>();
  for (const filter of filters) {
    const url = `${BASE}?${withKey(new URLSearchParams({ filter, 'per-page': '100', select: 'id,doi,referenced_works' }), ctx.apiKey)}`;
    const { data } = await ctx.http.getJson<{ results: SeedWork[] }>('openalex', url, { signal: ctx.signal });
    for (const w of data.results) {
      const oa = normalizeOpenAlexId(w.id);
      if (!oa) continue;
      const mapId = byOpenAlex.get(oa) ?? byDoi.get(normalizeDoi(w.doi ?? '') ?? '');
      if (!mapId) continue;
      const refs = [...new Set((w.referenced_works ?? []).map((r) => normalizeOpenAlexId(r)).filter((r): r is string => !!r))];
      out.set(oa, { mapId, refs });
    }
  }
  return out;
}

interface Evidence {
  citedBy: Set<string>;
  cites: Set<string>;
  cocited: number;
}

/**
 * Important works the map lacks (DESIGN 15.1): works many map papers cite
 * (foundations), works citing many map papers (follow-up research), and works
 * that the papers citing the map cite alongside it (co-citation).
 */
export async function findMissingPapers(papers: MissingInput[], limit: number, ctx: ExpandContext): Promise<MissingResponse> {
  const seeds = await seedWorks(papers, ctx);
  const seedIds = new Set(seeds.keys());
  const evidence = new Map<string, Evidence>();
  const of = (id: string) => {
    let e = evidence.get(id);
    if (!e) evidence.set(id, (e = { citedBy: new Set(), cites: new Set(), cocited: 0 }));
    return e;
  };

  // Foundations, and how many of the commonly cited works the map already has.
  const citedCount = new Map<string, number>();
  for (const { mapId, refs } of seeds.values()) {
    for (const r of refs) {
      citedCount.set(r, (citedCount.get(r) ?? 0) + 1);
      if (!seedIds.has(r)) of(r).citedBy.add(mapId);
    }
  }
  const withRefs = [...seeds.values()].filter((s) => s.refs.length > 0).length;
  const threshold = Math.max(2, Math.ceil(withRefs * 0.1));
  const common = [...citedCount].filter(([, n]) => n >= threshold);
  const coverage = { threshold, total: common.length, inMap: common.filter(([id]) => seedIds.has(id)).length };

  // Follow-up research and co-citation, from well-cited works that cite the map.
  const fetched = new Map<string, Paper>();
  const failed: MissingResponse['failed'] = [];
  let citingWorks = 0;
  const seedList = [...seedIds];
  try {
    for (let i = 0; i < seedList.length && i < BATCH * CITING_PAGES; i += BATCH) {
      const params = new URLSearchParams({
        filter: `cites:${seedList.slice(i, i + BATCH).join('|')}`,
        sort: 'cited_by_count:desc',
        'per-page': '100',
        select: OPENALEX_SELECT,
      });
      const { data } = await ctx.http.getJson<{ results: OpenAlexWork[] }>('openalex', `${BASE}?${withKey(params, ctx.apiKey)}`, { signal: ctx.signal });
      for (const w of data.results) {
        const paper = normalizeOpenAlexWork(w);
        const id = paper.ids?.openalex;
        if (!id || seedIds.has(id) || fetched.has(id)) continue;
        fetched.set(id, paper);
        citingWorks++;
        const refs = paper.referenceIds ?? [];
        const cited = refs.filter((r) => seedIds.has(r));
        for (const r of cited) of(id).cites.add(seeds.get(r)!.mapId);
        if (cited.length === 0) continue;
        for (const r of refs) if (!seedIds.has(r) && r !== id) of(r).cocited++;
      }
    }
  } catch {
    failed.push('forward');
  }

  // Co-citation counts are on another scale; bring them to "map papers".
  const cocitedWeight = citingWorks ? seeds.size / citingWorks : 0;
  const scored: Array<[string, Evidence, number]> = [];
  for (const [id, e] of evidence) {
    if (e.citedBy.size < 2 && e.cites.size < 2 && e.cocited < 3) continue;
    scored.push([id, e, e.citedBy.size + e.cites.size + e.cocited * cocitedWeight]);
  }
  scored.sort((a, b) => b[2] - a[2]);
  const top = scored.slice(0, limit);
  const needed = top.map(([id]) => id).filter((id) => !fetched.has(id));
  if (needed.length) {
    for (const p of await fetchWorksById(needed, ctx)) if (p.ids?.openalex) fetched.set(p.ids.openalex, p);
  }

  const candidates: MissingCandidate[] = top
    .filter(([id]) => fetched.has(id))
    .map(([id, e, score]) => ({
      paper: fetched.get(id)!,
      citedBy: [...e.citedBy],
      cites: [...e.cites],
      cocited: e.cocited,
      score: Math.round(score * 100) / 100,
    }))
    .sort((a, b) => b.score - a.score || (b.paper.citationCount ?? 0) - (a.paper.citationCount ?? 0));
  return { candidates, coverage, seeds: seeds.size, citingWorks, failed };
}
