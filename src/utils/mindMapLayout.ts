import type { MapNode, MapSide, PaperEdge } from '../types';

export const ROOT_EDGE_PREFIX = 'root-';
export const GROUP_EDGE_PREFIX = 'grp-';

const SIZE = {
  query: { w: 300, h: 72 },
  cluster: { w: 230, h: 52 },
  paper: { w: 280, h: 118 },
};
const GAP = {
  rootToCluster: 140,
  clusterToPaper: 110,
  paperX: 40,
  paperY: 24,
  block: 64,
  tree: 160,
};
const MAX_ROWS_PER_COLUMN = 7;

function size(node: MapNode): { w: number; h: number } {
  const fallback = SIZE[node.type as keyof typeof SIZE] ?? SIZE.paper;
  return { w: node.measured?.width ?? fallback.w, h: node.measured?.height ?? fallback.h };
}

interface Block {
  clusterId: string;
  paperIds: string[];
  cols: number;
  /** Widest paper card in the block (cards grow when sized by citations). */
  colWidth: number;
  width: number;
  height: number;
}

export function hasMindMapStructure(nodes: MapNode[]): boolean {
  return nodes.some((n) => n.type === 'query');
}

/**
 * MindNode-style layout: each query root in the middle, its clusters split
 * between the left and right so both sides have similar height, and each
 * cluster's papers stacked in columns further out. Nodes outside any tree are
 * left untouched (the caller lays them out separately).
 */
export function mindMapLayout(nodes: MapNode[], edges: PaperEdge[]): { nodes: MapNode[]; edges: PaperEdge[]; placed: Set<string> } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  for (const e of edges) {
    if (!e.id.startsWith(ROOT_EDGE_PREFIX) && !e.id.startsWith(GROUP_EDGE_PREFIX)) continue;
    const list = children.get(e.source) ?? [];
    list.push(e.target);
    children.set(e.source, list);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const sides = new Map<string, MapSide>();
  const placed = new Set<string>();
  let treeTop = 0;

  for (const root of nodes.filter((n) => n.type === 'query')) {
    const rootSize = size(root);
    const blocks: Block[] = (children.get(root.id) ?? [])
      .filter((id) => byId.get(id)?.type === 'cluster' && !placed.has(id))
      .map((clusterId) => {
        const paperIds = (children.get(clusterId) ?? []).filter((id) => byId.has(id) && !placed.has(id));
        const cols = Math.max(1, Math.ceil(paperIds.length / MAX_ROWS_PER_COLUMN));
        const rows = Math.ceil(paperIds.length / cols) || 1;
        const paperH = Math.max(...paperIds.map((id) => size(byId.get(id)!).h), SIZE.paper.h);
        const colWidth = Math.max(...paperIds.map((id) => size(byId.get(id)!).w), SIZE.paper.w);
        const clusterH = size(byId.get(clusterId)!).h;
        return {
          clusterId,
          paperIds,
          cols,
          colWidth,
          width: cols * (colWidth + GAP.paperX),
          height: Math.max(clusterH, rows * paperH + (rows - 1) * GAP.paperY),
        };
      });

    // Balance the two sides greedily, biggest blocks first, keeping input order per side.
    const order = [...blocks].sort((a, b) => b.height - a.height);
    const right: Block[] = [];
    const left: Block[] = [];
    let rh = 0;
    let lh = 0;
    for (const b of order) {
      if (rh <= lh) {
        right.push(b);
        rh += b.height + GAP.block;
      } else {
        left.push(b);
        lh += b.height + GAP.block;
      }
    }
    const byInput = (a: Block, b: Block) => blocks.indexOf(a) - blocks.indexOf(b);
    right.sort(byInput);
    left.sort(byInput);

    const treeHeight = Math.max(rh, lh, rootSize.h) - GAP.block;
    const centerY = treeTop + treeHeight / 2;
    positions.set(root.id, { x: -rootSize.w / 2, y: centerY - rootSize.h / 2 });
    placed.add(root.id);

    const placeSide = (list: Block[], side: MapSide, total: number) => {
      let y = centerY - (total - GAP.block) / 2;
      for (const b of list) {
        const cluster = byId.get(b.clusterId)!;
        const cs = size(cluster);
        const clusterX =
          side === 'right' ? rootSize.w / 2 + GAP.rootToCluster : -rootSize.w / 2 - GAP.rootToCluster - cs.w;
        positions.set(cluster.id, { x: clusterX, y: y + b.height / 2 - cs.h / 2 });
        sides.set(cluster.id, side);
        placed.add(cluster.id);

        const rows = Math.ceil(b.paperIds.length / b.cols) || 1;
        const paperH = (b.height - (rows - 1) * GAP.paperY) / rows;
        b.paperIds.forEach((id, i) => {
          const col = Math.floor(i / rows);
          const row = i % rows;
          const x =
            side === 'right'
              ? clusterX + cs.w + GAP.clusterToPaper + col * (b.colWidth + GAP.paperX)
              : clusterX - GAP.clusterToPaper - (col + 1) * b.colWidth - col * GAP.paperX;
          positions.set(id, { x, y: y + row * (paperH + GAP.paperY) });
          sides.set(id, side);
          placed.add(id);
        });
        y += b.height + GAP.block;
      }
    };
    placeSide(right, 'right', rh);
    placeSide(left, 'left', lh);
    treeTop += treeHeight + GAP.tree;
  }

  const laidOut = nodes.map((n) => {
    const pos = positions.get(n.id);
    if (!pos) return n;
    const side = sides.get(n.id);
    const data = side && n.type !== 'query' ? { ...n.data, side } : n.data;
    return { ...n, position: pos, data } as MapNode;
  });

  // Root edges leave the root from the side their cluster sits on.
  const laidEdges = edges.map((e) =>
    e.id.startsWith(ROOT_EDGE_PREFIX) ? { ...e, sourceHandle: sides.get(e.target) === 'left' ? 'l' : 'r' } : e,
  );
  return { nodes: laidOut, edges: laidEdges, placed };
}
