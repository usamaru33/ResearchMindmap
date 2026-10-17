import type { GraphBuildResponse } from '../../shared/types';
import type { ClusterNode, MapNode, PaperEdge, PaperNode, QueryRootNode } from '../types';
import { GROUP_EDGE_PREFIX, ROOT_EDGE_PREFIX } from '../utils/mindMapLayout';

// Distinct, readable on white; matches the app's accent family.
export const CLUSTER_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16'];
const OTHER_COLOR = '#94a3b8';

function hash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export interface GraphImportOptions {
  query: string;
  mode: 'query' | 'vague';
  now?: string;
}

/**
 * Turn a /api/graph/build response into map elements:
 * query root → cluster nodes → paper nodes. Citation edges are derived later
 * from `paper.references` by the reducer, like every other citation edge.
 */
export function buildGraphElements(
  graph: GraphBuildResponse,
  opts: GraphImportOptions,
): { nodes: MapNode[]; edges: PaperEdge[] } {
  const now = opts.now ?? new Date().toISOString();
  // A stable id per query+time so repeated imports of the same query get their own root.
  const rootId = `q-${hash(`${opts.query}|${now}`)}`;
  const root: QueryRootNode = {
    id: rootId,
    type: 'query',
    position: { x: 0, y: 0 },
    data: { query: opts.query, mode: opts.mode, paperCount: graph.papers.length, createdAt: now },
  };

  const papers = new Map(graph.papers.map((p) => [p.id, p]));
  const nodes: MapNode[] = [root];
  const edges: PaperEdge[] = [];
  const colorOf = new Map<string, string>();

  graph.clusters.forEach((cluster, i) => {
    const color = cluster.id === 'other' ? OTHER_COLOR : CLUSTER_COLORS[i % CLUSTER_COLORS.length];
    const clusterId = `c-${rootId}-${hash(cluster.id)}`;
    const node: ClusterNode = {
      id: clusterId,
      type: 'cluster',
      position: { x: 0, y: 0 },
      data: { label: cluster.label, level: cluster.level, size: cluster.paperIds.length, color },
    };
    nodes.push(node);
    edges.push({
      id: `${ROOT_EDGE_PREFIX}${clusterId}`,
      source: rootId,
      target: clusterId,
      type: 'default',
      style: { stroke: color, strokeWidth: 3 },
      data: { relationship: 'cluster' },
    });
    for (const paperId of cluster.paperIds) {
      if (!papers.has(paperId)) continue;
      colorOf.set(paperId, color);
      edges.push({
        id: `${GROUP_EDGE_PREFIX}${clusterId}-${paperId}`,
        source: clusterId,
        target: paperId,
        type: 'default',
        style: { stroke: color, strokeWidth: 1.5, opacity: 0.7 },
        data: { relationship: 'member' },
      });
    }
  });

  for (const paper of graph.papers) {
    const node: PaperNode = {
      id: paper.id,
      type: 'paper',
      position: { x: 0, y: 0 },
      data: { paper: { ...paper, addedAt: paper.addedAt ?? now }, isExpanded: false, accent: colorOf.get(paper.id) },
    };
    nodes.push(node);
  }
  return { nodes, edges };
}

export function isStructuralEdge(edge: PaperEdge): boolean {
  return edge.id.startsWith(ROOT_EDGE_PREFIX) || edge.id.startsWith(GROUP_EDGE_PREFIX);
}
