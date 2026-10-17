import Dagre from '@dagrejs/dagre';
import type { PaperNode, PaperEdge, LayoutDirection } from '../types';

const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 110;

export function getLayoutedElements(
  nodes: PaperNode[],
  edges: PaperEdge[],
  direction: LayoutDirection = 'LR',
): { nodes: PaperNode[]; edges: PaperEdge[] } {
  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 80,
    ranksep: 120,
    marginx: 40,
    marginy: 40,
  });

  for (const node of nodes) {
    g.setNode(node.id, {
      width: node.measured?.width ?? DEFAULT_NODE_WIDTH,
      height: node.measured?.height ?? DEFAULT_NODE_HEIGHT,
    });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  Dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    const w = node.measured?.width ?? DEFAULT_NODE_WIDTH;
    const h = node.measured?.height ?? DEFAULT_NODE_HEIGHT;
    return {
      ...node,
      position: {
        x: pos.x - w / 2,
        y: pos.y - h / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
