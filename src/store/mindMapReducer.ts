import { MarkerType } from '@xyflow/react';
import { isPaperNode, type MindMapState, type MindMapAction, type MapNode, type MapSnapshot, type PaperNode, type PaperEdge, type Paper } from '../types';
import { needsLayout } from './projects';
import { getEdgeStyle } from '../utils/helpers';

export const CITE_EDGE_PREFIX = 'cite-';

export function createPaperNode(paper: Paper, position: { x: number; y: number }): PaperNode {
  return {
    id: paper.id,
    type: 'paper',
    position,
    data: { paper, isExpanded: false },
  };
}

export function createStyledEdge(
  id: string,
  source: string,
  target: string,
  relationship: string,
): PaperEdge {
  const style = getEdgeStyle(relationship);
  return {
    id,
    source,
    target,
    type: 'smoothstep',
    animated: style.animated,
    style: { stroke: style.stroke, strokeWidth: style.strokeWidth },
    // Citations are the bulk of the edges; arrows say enough, labels would clutter.
    label: relationship === 'cites' ? undefined : relationship,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: style.stroke },
    data: { relationship },
  };
}

export function isCitationEdge(edge: PaperEdge): boolean {
  return edge.id.startsWith(CITE_EDGE_PREFIX);
}

/** Build citation edges from all papers' references fields.
 *  Edge direction: referenced paper (source) → citing paper (target)
 *  so the graph branches out from seminal papers to derived works. */
export function buildCitationEdges(nodes: MapNode[]): PaperEdge[] {
  const nodeIds = new Set(nodes.filter(isPaperNode).map((n) => n.id));
  const edges: PaperEdge[] = [];
  for (const node of nodes) {
    if (!isPaperNode(node)) continue;
    const paper = node.data.paper;
    for (const refId of paper.references) {
      if (nodeIds.has(refId)) {
        edges.push(createStyledEdge(`${CITE_EDGE_PREFIX}${refId}-${paper.id}`, refId, paper.id, 'cites'));
      }
    }
  }
  return edges;
}

/** Keep manual edges whose endpoints still exist, and regenerate citation edges. */
export function rebuildEdges(nodes: MapNode[], currentEdges: PaperEdge[]): PaperEdge[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const manual = currentEdges.filter(
    (e) => !isCitationEdge(e) && nodeIds.has(e.source) && nodeIds.has(e.target),
  );
  return [...buildCitationEdges(nodes), ...manual];
}

function updatePaper(node: MapNode, patch: (paper: Paper) => Paper): MapNode {
  if (!isPaperNode(node)) return node;
  return { ...node, data: { ...node.data, paper: patch(node.data.paper) } };
}

// Fields the user owns; a re-import must not overwrite them.
const USER_FIELDS = ['challenges', 'futureWork', 'thumbnailUrl', 'status', 'tags', 'notes', 'rating', 'screening', 'addedAt'] as const;

/** Refresh an existing paper with newly fetched metadata, keeping user edits and links. */
export function mergeImportedPaper(existing: Paper, incoming: Paper): Paper {
  const merged: Paper = { ...existing, ...incoming };
  for (const key of USER_FIELDS) {
    const value = existing[key];
    if (value !== undefined && value !== '') (merged as unknown as Record<string, unknown>)[key] = value;
  }
  merged.references = [...new Set([...existing.references, ...incoming.references])];
  return merged;
}

function importGraph(state: MindMapState, incoming: MapNode[], incomingEdges: PaperEdge[]): MindMapState {
  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  const nodes = [...state.nodes];
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  for (const node of incoming) {
    const existing = byId.get(node.id);
    if (!existing) {
      index.set(node.id, nodes.length);
      nodes.push(node);
    } else if (isPaperNode(existing) && isPaperNode(node)) {
      nodes[index.get(node.id)!] = {
        ...existing,
        data: { ...existing.data, ...node.data, paper: mergeImportedPaper(existing.data.paper, node.data.paper) },
      };
    } else {
      nodes[index.get(node.id)!] = { ...existing, data: node.data } as MapNode;
    }
  }
  const edgeIds = new Set(state.edges.map((e) => e.id));
  const edges = [...state.edges, ...incomingEdges.filter((e) => !edgeIds.has(e.id))];
  return {
    ...state,
    nodes,
    edges: rebuildEdges(nodes, edges),
    viewRequest: { kind: 'layout', seq: state.viewRequest.seq + 1 },
  };
}

function deletePapers(state: MindMapState, ids: string[]): MindMapState {
  const removed = new Set(ids);
  if (removed.size === 0) return state;
  const nodes = state.nodes
    .filter((n) => !removed.has(n.id))
    .map((n) =>
      isPaperNode(n) && n.data.paper.references.some((r) => removed.has(r))
        ? updatePaper(n, (p) => ({ ...p, references: p.references.filter((r) => !removed.has(r)) }))
        : n,
    );
  const selectionRemoved = state.selectedNodeId !== null && removed.has(state.selectedNodeId);
  return {
    ...state,
    nodes,
    edges: rebuildEdges(nodes, state.edges),
    selectedNodeId: selectionRemoved ? null : state.selectedNodeId,
    sidebarMode: selectionRemoved && state.sidebarMode === 'edit' ? 'closed' : state.sidebarMode,
  };
}

function removeConnections(state: MindMapState, ids: string[]): MindMapState {
  const removed = new Set(ids);
  const targets = state.edges.filter((e) => removed.has(e.id));
  if (targets.length === 0) return state;

  // A citation edge is derived from `references`; drop the reference too so
  // the edge is not regenerated by the next rebuild.
  const droppedRefs = new Map<string, Set<string>>();
  for (const edge of targets) {
    if (!isCitationEdge(edge)) continue;
    const refs = droppedRefs.get(edge.target) ?? new Set<string>();
    refs.add(edge.source);
    droppedRefs.set(edge.target, refs);
  }
  const nodes = droppedRefs.size
    ? state.nodes.map((n) => {
        const refs = droppedRefs.get(n.id);
        return refs
          ? updatePaper(n, (p) => ({ ...p, references: p.references.filter((r) => !refs.has(r)) }))
          : n;
      })
    : state.nodes;

  return { ...state, nodes, edges: state.edges.filter((e) => !removed.has(e.id)) };
}

export function initMindMapState(snapshot: MapSnapshot): MindMapState {
  return {
    nodes: snapshot.nodes,
    edges: rebuildEdges(snapshot.nodes, snapshot.edges),
    selectedNodeId: null,
    sidebarMode: 'closed',
    layoutDirection: snapshot.layoutDirection,
    viewRequest: { kind: needsLayout(snapshot.nodes) ? 'layout' : 'fit', seq: 0 },
  };
}

export function mindMapReducer(state: MindMapState, action: MindMapAction): MindMapState {
  switch (action.type) {
    case 'SET_NODES':
      return { ...state, nodes: action.payload };

    case 'SET_EDGES':
      return { ...state, edges: action.payload };

    case 'ADD_PAPER': {
      const newNode = createPaperNode(action.payload.paper, action.payload.position);
      const newNodes = [...state.nodes, newNode];
      return { ...state, nodes: newNodes, edges: rebuildEdges(newNodes, state.edges) };
    }

    case 'UPDATE_PAPER': {
      const updated = action.payload;
      const newNodes = state.nodes.map((n) => (n.id === updated.id ? updatePaper(n, () => updated) : n));
      return { ...state, nodes: newNodes, edges: rebuildEdges(newNodes, state.edges) };
    }

    case 'DELETE_PAPER':
      return deletePapers(state, [action.payload]);

    case 'DELETE_PAPERS':
      return deletePapers(state, action.payload);

    case 'TOGGLE_EXPAND':
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === action.payload && isPaperNode(n) ? { ...n, data: { ...n.data, isExpanded: !n.data.isExpanded } } : n,
        ),
      };

    case 'ADD_CONNECTION': {
      const { id, source, target, relationship } = action.payload;
      if (source === target) return state;
      const edge = createStyledEdge(id, source, target, relationship);
      return { ...state, edges: [...state.edges, edge] };
    }

    case 'REMOVE_CONNECTION':
      return removeConnections(state, [action.payload]);

    case 'REMOVE_CONNECTIONS':
      return removeConnections(state, action.payload);

    case 'SELECT_NODE':
      return { ...state, selectedNodeId: action.payload };

    case 'SET_SIDEBAR_MODE':
      return { ...state, sidebarMode: action.payload };

    case 'SET_LAYOUT_DIRECTION':
      return { ...state, layoutDirection: action.payload };

    case 'APPLY_LAYOUT':
      return { ...state, nodes: action.payload.nodes, edges: action.payload.edges };

    case 'LOAD_MAP': {
      const next = initMindMapState(action.payload);
      return {
        ...next,
        // Search belongs to the app, not the map: keep it open across project switches.
        sidebarMode: state.sidebarMode === 'search' ? 'search' : 'closed',
        viewRequest: { ...next.viewRequest, seq: state.viewRequest.seq + 1 },
      };
    }

    case 'IMPORT_GRAPH':
      return importGraph(state, action.payload.nodes, action.payload.edges);

    case 'REQUEST_VIEW':
      return { ...state, viewRequest: { kind: action.payload, seq: state.viewRequest.seq + 1 } };

    default:
      return state;
  }
}
