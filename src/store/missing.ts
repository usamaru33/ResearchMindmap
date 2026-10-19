import type { MissingCandidate } from '../../shared/types';
import type { Paper } from '../types';
import { matchExisting } from './identity';

/** The most papers sent to the server (its limit). */
export const MAX_SEEDS = 300;

export type MissingSignal = 'foundation' | 'followUp' | 'cocited';

/** Map papers OpenAlex can find (an OpenAlex id, DOI or arXiv id); the most cited first when there are too many. */
export function missingSeeds(papers: Paper[]): Array<{ id: string; ids: { doi?: string; openalex?: string; arxiv?: string } }> {
  return papers
    .filter((p) => p.ids?.openalex || p.ids?.doi || p.ids?.arxiv)
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, MAX_SEEDS)
    .map((p) => ({ id: p.id, ids: { doi: p.ids?.doi, openalex: p.ids?.openalex, arxiv: p.ids?.arxiv } }));
}

/** Which of the three clues a candidate has (thresholds as on the server). */
export function signalsOf(c: MissingCandidate): MissingSignal[] {
  const out: MissingSignal[] = [];
  if (c.citedBy.length >= 2) out.push('foundation');
  if (c.cites.length >= 2) out.push('followUp');
  if (c.cocited >= 3) out.push('cocited');
  return out;
}

/** Candidates that are not in the map under another id (DOI, arXiv id or title), optionally of one clue. */
export function visibleCandidates(candidates: MissingCandidate[], mapPapers: Paper[], signal?: MissingSignal): MissingCandidate[] {
  const idMap = matchExisting(mapPapers, candidates.map((c) => c.paper));
  const inMap = new Set(mapPapers.map((p) => p.id));
  return candidates.filter((c) => !inMap.has(idMap.get(c.paper.id) ?? c.paper.id) && (!signal || signalsOf(c).includes(signal)));
}

/** The citations to draw when candidates are added: map papers citing them, and them citing map papers. */
export function linksFor(candidates: MissingCandidate[]): Array<[string, string]> {
  return candidates.flatMap((c) => [
    ...c.citedBy.map((m): [string, string] => [m, c.paper.id]),
    ...c.cites.map((m): [string, string] => [c.paper.id, m]),
  ]);
}

/** Share of the commonly cited works already in the map, as a whole percentage (null when there are none). */
export function coveragePercent(coverage: { total: number; inMap: number }): number | null {
  return coverage.total ? Math.round((coverage.inMap / coverage.total) * 100) : null;
}
