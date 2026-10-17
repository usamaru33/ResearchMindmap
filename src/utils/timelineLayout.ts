import { isPaperNode, type MapNode } from '../types';

export const YEAR_WIDTH = 340;
const ROW_HEIGHT = 150;
const LABEL_GAP = 420;

export interface TimelineResult {
  nodes: MapNode[];
  /** Year columns for drawing the axis: year (0 = undated) and its x. */
  columns: Array<{ year: number; x: number }>;
  top: number;
}

/**
 * Lay papers out on a time axis: one column per year (empty years collapsed
 * to keep the map compact), papers stacked by cluster color then citations.
 * Query and cluster nodes are stacked in a column to the left.
 */
export function timelineLayout(nodes: MapNode[]): TimelineResult {
  const papers = nodes.filter(isPaperNode);
  const years = [...new Set(papers.map((p) => p.data.paper.year || 0))].sort((a, b) => {
    if (a === 0) return 1;
    if (b === 0) return -1;
    return a - b;
  });
  const colX = new Map(years.map((y, i) => [y, i * YEAR_WIDTH]));
  const byYear = new Map<number, MapNode[]>();
  for (const n of papers) {
    const y = n.data.paper.year || 0;
    byYear.set(y, [...(byYear.get(y) ?? []), n]);
  }
  const positions = new Map<string, { x: number; y: number }>();
  for (const [year, list] of byYear) {
    list
      .sort((a, b) => {
        const pa = isPaperNode(a) ? a.data : null;
        const pb = isPaperNode(b) ? b.data : null;
        return (
          String(pa?.accent ?? '').localeCompare(String(pb?.accent ?? '')) ||
          (pb?.paper.citationCount ?? 0) - (pa?.paper.citationCount ?? 0)
        );
      })
      .forEach((n, i) => positions.set(n.id, { x: colX.get(year)!, y: i * ROW_HEIGHT }));
  }
  const others = nodes.filter((n) => !isPaperNode(n));
  others.forEach((n, i) => positions.set(n.id, { x: -LABEL_GAP, y: i * 90 }));

  return {
    nodes: nodes.map((n) => {
      const pos = positions.get(n.id);
      if (!pos) return n;
      // Timeline cards connect left-to-right; drop any mind-map side.
      const data = 'side' in n.data ? { ...n.data, side: undefined } : n.data;
      return { ...n, position: pos, data } as MapNode;
    }),
    columns: years.map((year) => ({ year, x: colX.get(year)! })),
    top: 0,
  };
}
