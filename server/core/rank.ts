import type { Paper } from '../../shared/types';
import { mergePaperLists } from './merge';

export interface FuseOptions {
  /** RRF constant; larger values flatten the advantage of top ranks. */
  k?: number;
  /** Share of the final score given to (log) citation count, 0–1. */
  citationWeight?: number;
  /** Optional per-list weights (e.g. trust semantic search more). */
  weights?: number[];
}

/**
 * Reciprocal Rank Fusion: score(d) = Σ_lists w / (k + rank(d)).
 * Works across sources whose native scores are not comparable.
 */
export function rrfScores(rankings: number[][], itemCount: number, k = 60, weights?: number[]): number[] {
  const scores = new Array<number>(itemCount).fill(0);
  rankings.forEach((ranking, li) => {
    const w = weights?.[li] ?? 1;
    const seen = new Set<number>();
    ranking.forEach((item, pos) => {
      if (seen.has(item)) return; // a source listing the same work twice counts once
      seen.add(item);
      scores[item] += w / (k + pos + 1);
    });
  });
  return scores;
}

/** Merge per-source ranked lists into one deduplicated list ordered by fused relevance (0–1). */
export function fuseRankedLists(lists: Paper[][], opts: FuseOptions = {}): Paper[] {
  const { papers, assignments } = mergePaperLists(lists);
  if (papers.length === 0) return [];
  const rrf = rrfScores(assignments, papers.length, opts.k ?? 60, opts.weights);
  const maxRrf = Math.max(...rrf) || 1;
  const maxCites = Math.max(...papers.map((p) => p.citationCount ?? 0));
  const cw = opts.citationWeight ?? 0.15;

  const scored = papers.map((p, i) => {
    const citeScore = maxCites > 0 ? Math.log10(1 + (p.citationCount ?? 0)) / Math.log10(1 + maxCites) : 0;
    const relevance = (1 - cw) * (rrf[i] / maxRrf) + cw * citeScore;
    return { ...p, relevance: Math.round(relevance * 1000) / 1000 };
  });
  return scored.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}
