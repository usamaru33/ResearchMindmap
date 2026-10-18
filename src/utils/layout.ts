import Dagre from '@dagrejs/dagre';
import type { MapNode, PaperEdge, LayoutDirection } from '../types';
import { hasMindMapStructure, mindMapLayout } from './mindMapLayout';

const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 110;

function dagreLayout(nodes: MapNode[], edges: PaperEdge[], direction: LayoutDirection): MapNode[] {
  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 80,
    ranksep: 120,
    marginx: 40,
    marginy: 40,
  });

  const ids = new Set(nodes.map((n) => n.id));
  for (const node of nodes) {
    g.setNode(node.id, {
      width: node.measured?.width ?? DEFAULT_NODE_WIDTH,
      height: node.measured?.height ?? DEFAULT_NODE_HEIGHT,
    });
  }

  for (const edge of edges) {
    if (ids.has(edge.source) && ids.has(edge.target)) g.setEdge(edge.source, edge.target);
  }

  Dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const w = node.measured?.width ?? DEFAULT_NODE_WIDTH;
    const h = node.measured?.height ?? DEFAULT_NODE_HEIGHT;
    // Hand-placed papers drop any mind-map side so their handles follow the direction.
    const data = 'side' in node.data ? { ...node.data, side: undefined } : node.data;
    return { ...node, data, position: { x: pos.x - w / 2, y: pos.y - h / 2 } } as MapNode;
  });
}

/** Notes stay where the user put them; everything else is laid out. */
export function getLayoutedElements(
  nodes: MapNode[],
  edges: PaperEdge[],
  direction: LayoutDirection = 'LR',
): { nodes: MapNode[]; edges: PaperEdge[] } {
  if (!nodes.some((n) => n.type === 'note')) return layoutAll(nodes, edges, direction);
  const laid = layoutAll(
    nodes.filter((n) => n.type !== 'note'),
    edges,
    direction,
  );
  const byId = new Map(laid.nodes.map((n) => [n.id, n]));
  return { nodes: nodes.map((n) => byId.get(n.id) ?? n), edges: laid.edges };
}

function layoutAll(nodes: MapNode[], edges: PaperEdge[], direction: LayoutDirection): { nodes: MapNode[]; edges: PaperEdge[] } {
  if (!hasMindMapStructure(nodes)) {
    return { nodes: dagreLayout(nodes, edges, direction), edges };
  }

  const tree = mindMapLayout(nodes, edges);
  const loose = tree.nodes.filter((n) => !tree.placed.has(n.id));
  if (loose.length === 0) return { nodes: tree.nodes, edges: tree.edges };

  // Nodes outside the generated trees (e.g. papers added by hand) go below them.
  const placedNodes = tree.nodes.filter((n) => tree.placed.has(n.id));
  const bottom = Math.max(...placedNodes.map((n) => n.position.y + (n.measured?.height ?? DEFAULT_NODE_HEIGHT)));
  const left = Math.min(...placedNodes.map((n) => n.position.x));
  const looseLaid = new Map(dagreLayout(loose, edges, direction).map((n) => [n.id, n]));
  return {
    nodes: tree.nodes.map((n) => {
      const laid = looseLaid.get(n.id);
      return laid ? { ...laid, position: { x: laid.position.x + left, y: laid.position.y + bottom + 200 } } : n;
    }),
    edges: tree.edges,
  };
}
