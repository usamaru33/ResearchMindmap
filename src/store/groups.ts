import type { MapNode, PaperEdge } from '../types';
import { GROUP_EDGE_PREFIX } from '../utils/mindMapLayout';

export interface PaperGroup {
  label: string;
  paperIds: string[];
}

/** The map's clusters as ordered groups of paper ids (cluster node order; "Other" last). */
export function clusterGroups(nodes: MapNode[], edges: PaperEdge[]): PaperGroup[] {
  const groups = new Map<string, PaperGroup>();
  for (const n of nodes) {
    if (n.type === 'cluster') groups.set(n.id, { label: n.data.label, paperIds: [] });
  }
  for (const e of edges) {
    if (!e.id.startsWith(GROUP_EDGE_PREFIX)) continue;
    groups.get(e.source)?.paperIds.push(e.target);
  }
  const list = [...groups.values()].filter((g) => g.paperIds.length > 0);
  const isOther = (g: PaperGroup) => /^(other|papers)$/i.test(g.label);
  return [...list.filter((g) => !isOther(g)), ...list.filter(isOther)];
}
