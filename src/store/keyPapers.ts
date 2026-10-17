import type { Paper } from '../types';

export type PaperRole = 'foundation' | 'recent';

/**
 * Mark papers by their place in the map's citation structure:
 * - foundation: cited by many papers in the map (in-map in-degree in the top
 *   quarter, and at least 2)
 * - recent: among the newest papers (last 2 years present) that build on at
 *   least one paper in the map
 */
export function paperRoles(papers: Paper[]): Map<string, PaperRole> {
  const ids = new Set(papers.map((p) => p.id));
  const inDegree = new Map<string, number>();
  for (const p of papers) for (const r of p.references) if (ids.has(r)) inDegree.set(r, (inDegree.get(r) ?? 0) + 1);

  const roles = new Map<string, PaperRole>();
  const degrees = [...inDegree.values()].sort((a, b) => b - a);
  if (degrees.length) {
    const cutoff = Math.max(2, degrees[Math.floor((degrees.length - 1) * 0.25)]);
    for (const [id, d] of inDegree) if (d >= cutoff) roles.set(id, 'foundation');
  }
  const years = papers.map((p) => p.year).filter((y) => y > 0);
  if (years.length) {
    const newest = Math.max(...years);
    for (const p of papers) {
      if (roles.has(p.id) || p.year < newest - 1) continue;
      if (p.references.some((r) => ids.has(r))) roles.set(p.id, 'recent');
    }
  }
  return roles;
}
