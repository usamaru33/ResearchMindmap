import type { Paper } from '../types';

export interface FlowPeriod {
  from: number;
  to: number;
  count: number;
  /** Most frequent topics in the period, with paper counts. */
  topics: Array<{ name: string; count: number }>;
}

/**
 * How someone's (or a venue's) research moved over time: split the papers
 * into up to `periods` spans of similar size and list the leading topics of each.
 * Uses fine-grained topics; falls back to keywords when a paper has none.
 */
export function researchFlow(papers: Paper[], periods = 4, topicsPerPeriod = 3): FlowPeriod[] {
  const dated = papers.filter((p) => p.year > 0).sort((a, b) => a.year - b.year);
  if (dated.length === 0) return [];
  const years = [...new Set(dated.map((p) => p.year))];
  const spans = Math.min(periods, years.length);
  const out: FlowPeriod[] = [];
  let start = 0;
  for (let s = 0; s < spans; s++) {
    // Cut on a year boundary close to an even share of the papers.
    const target = Math.round(((s + 1) * dated.length) / spans);
    let end = s === spans - 1 ? dated.length : Math.max(start + 1, target);
    while (end < dated.length && dated[end].year === dated[end - 1].year) end++;
    if (start >= dated.length) break;
    const slice = dated.slice(start, end);
    const counts = new Map<string, number>();
    for (const p of slice) {
      const names = p.topics?.filter((t) => t.level === 'topic').map((t) => t.name) ?? [];
      const labels = names.length ? names.slice(0, 2) : (p.keywords ?? []).slice(0, 2);
      for (const name of new Set(labels)) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    out.push({
      from: slice[0].year,
      to: slice[slice.length - 1].year,
      count: slice.length,
      topics: [...counts]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, topicsPerPeriod)
        .map(([name, count]) => ({ name, count })),
    });
    start = end;
  }
  return out;
}
