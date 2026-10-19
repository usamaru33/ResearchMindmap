import { MarkerType, applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import { isPaperNode, type MindMapState, type MindMapAction, type MapNode, type MapSnapshot, type PaperNode, type PaperEdge, type Paper } from '../types';
import { titleSimilarity } from '../../shared/ids';
import { matchExisting } from './identity';
import { mergeSeen } from './alerts';
import { mergePaperRecords } from './libraryCheck';
import { GROUP_EDGE_PREFIX } from '../utils/mindMapLayout';
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
    // Bezier curves, like the map's structural edges.
    type: 'default',
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
const USER_FIELDS = ['challenges', 'futureWork', 'thumbnailUrl', 'status', 'tags', 'notes', 'rating', 'screening', 'comparison', 'citeKey', 'addedAt'] as const;

/**
 * Refresh an existing paper with newly fetched metadata, keeping user edits and links.
 * When the titles disagree, the incoming record is probably a catalogue error filed under
 * the same id: it only fills fields the existing paper lacks.
 */
export function mergeImportedPaper(existing: Paper, incoming: Paper): Paper {
  const suspect = !!existing.title && !!incoming.title && titleSimilarity(existing.title, incoming.title) < 0.5;
  const merged: Paper = { ...existing, ...incoming };
  if (suspect) {
    Object.assign(merged, existing, { ids: { ...incoming.ids, ...existing.ids } });
    for (const [key, value] of Object.entries(existing) as Array<[keyof Paper, unknown]>) {
      const empty = value === '' || value === 0 || (Array.isArray(value) && value.length === 0);
      if (empty && incoming[key] !== undefined) (merged as unknown as Record<string, unknown>)[key] = incoming[key];
    }
  }
  for (const key of USER_FIELDS) {
    const value = existing[key];
    if (value !== undefined && value !== '') (merged as unknown as Record<string, unknown>)[key] = value;
  }
  merged.references = [...new Set([...existing.references, ...incoming.references])];
  return merged;
}

/** Rewrite incoming papers (ids, references) and edges onto the ids of matching papers already in the map. */
function remapIncoming(state: MindMapState, incoming: MapNode[], incomingEdges: PaperEdge[]) {
  const existingPapers = state.nodes.filter(isPaperNode).map((n) => n.data.paper);
  const incomingPapers = incoming.filter(isPaperNode).map((n) => n.data.paper);
  const map = matchExisting(existingPapers, incomingPapers);
  const to = (id: string) => map.get(id) ?? id;
  const nodes = incoming.map((n) =>
    isPaperNode(n)
      ? {
          ...n,
          id: to(n.id),
          data: {
            ...n.data,
            paper: { ...n.data.paper, id: to(n.id), references: [...new Set(n.data.paper.references.map(to))] },
          },
        }
      : n,
  );
  const edges = incomingEdges.map((e) => {
    const source = to(e.source);
    const target = to(e.target);
    if (source === e.source && target === e.target) return e;
    return { ...e, source, target, id: e.id.replace(e.target, target).replace(e.source, source) };
  });
  return { nodes, edges };
}

function importGraph(state: MindMapState, rawIncoming: MapNode[], rawEdges: PaperEdge[]): MindMapState {
  const { nodes: incoming, edges: incomingEdges } = remapIncoming(state, rawIncoming, rawEdges);
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

const LINK_COLUMN_WIDTH = 340;
const LINK_ROW_HEIGHT = 150;
const LINKS_PER_COLUMN = 6;

/**
 * Add papers found from one paper (snowballing) next to it: references on
 * its left, citing papers on its right, related papers below. Papers already
 * in the map are linked, not duplicated.
 */
function addLinkedPapers(state: MindMapState, anchorId: string, papers: Paper[], kind: 'references' | 'citations' | 'related'): MindMapState {
  const anchor = state.nodes.find((n) => n.id === anchorId);
  if (!anchor || !isPaperNode(anchor)) return state;
  const existing = new Map(state.nodes.filter(isPaperNode).map((n) => [n.id, n]));
  // Same work already in the map under another id → reuse that node.
  const idMap = matchExisting([...existing.values()].map((n) => n.data.paper), papers);
  papers = papers.map((p) => ({ ...p, id: idMap.get(p.id) ?? p.id }));
  const fresh = papers.filter((p) => p.id !== anchorId && !existing.has(p.id));
  const linkedIds = papers.filter((p) => p.id !== anchorId).map((p) => p.id);

  const placed = fresh.map((paper, i) => {
    const col = Math.floor(i / LINKS_PER_COLUMN);
    const row = i % LINKS_PER_COLUMN;
    const { x, y } = anchor.position;
    const offsetY = (row - (Math.min(fresh.length, LINKS_PER_COLUMN) - 1) / 2) * LINK_ROW_HEIGHT;
    const position =
      kind === 'references'
        ? { x: x - LINK_COLUMN_WIDTH * (col + 1), y: y + offsetY }
        : kind === 'citations'
          ? { x: x + LINK_COLUMN_WIDTH * (col + 1), y: y + offsetY }
          : { x: x + (row - 2.5) * LINK_COLUMN_WIDTH, y: y + LINK_ROW_HEIGHT * (col + 1.2) };
    const withRefs = kind === 'citations' ? { ...paper, references: [...new Set([...paper.references, anchorId])] } : paper;
    return createPaperNode({ ...withRefs, addedAt: withRefs.addedAt ?? new Date().toISOString() }, position);
  });

  let nodes: MapNode[] = [...state.nodes, ...placed];
  if (kind === 'references') {
    nodes = nodes.map((n) => (n.id === anchorId ? updatePaper(n, (p) => ({ ...p, references: [...new Set([...p.references, ...linkedIds])] })) : n));
  } else if (kind === 'citations') {
    const citing = new Set(linkedIds);
    nodes = nodes.map((n) =>
      citing.has(n.id) && existing.has(n.id) ? updatePaper(n, (p) => ({ ...p, references: [...new Set([...p.references, anchorId])] })) : n,
    );
  }

  let edges = state.edges;
  if (kind === 'related') {
    const ids = new Set(edges.map((e) => e.id));
    const related = linkedIds
      .map((id) => createStyledEdge(`e-rel-${anchorId}-${id}`, anchorId, id, 'related to'))
      .filter((e) => !ids.has(e.id));
    edges = [...edges, ...related];
  }
  return {
    ...state,
    nodes,
    edges: rebuildEdges(nodes, edges),
    viewRequest: { kind: 'fit', seq: state.viewRequest.seq + 1 },
  };
}

const GRID_COLUMNS = 4;
const HISTORY_LIMIT = 50;

/** Add papers in a grid around `center`; papers already in the map are refreshed instead. */
function addPapers(state: MindMapState, papers: Paper[], center: { x: number; y: number }): MindMapState {
  const existingNodes = state.nodes.filter(isPaperNode);
  const idMap = matchExisting(existingNodes.map((n) => n.data.paper), papers);
  const byId = new Map(existingNodes.map((n) => [n.id, n]));
  const now = new Date().toISOString();
  const updates = new Map<string, Paper>();
  const fresh: Paper[] = [];
  for (const p of papers) {
    const id = idMap.get(p.id) ?? p.id;
    const hit = byId.get(id);
    if (hit) updates.set(id, mergeImportedPaper(hit.data.paper, { ...p, id }));
    else if (!fresh.some((f) => f.id === id)) fresh.push({ ...p, id, addedAt: p.addedAt ?? now });
  }
  const cols = Math.min(GRID_COLUMNS, fresh.length) || 1;
  const rows = Math.ceil(fresh.length / cols);
  const placed = fresh.map((p, i) =>
    createPaperNode(p, {
      x: center.x + ((i % cols) - (cols - 1) / 2) * LINK_COLUMN_WIDTH - 140,
      y: center.y + (Math.floor(i / cols) - (rows - 1) / 2) * LINK_ROW_HEIGHT - 55,
    }),
  );
  const nodes = [...state.nodes.map((n) => (updates.has(n.id) ? updatePaper(n, () => updates.get(n.id)!) : n)), ...placed];
  return { ...state, nodes, edges: rebuildEdges(nodes, state.edges), viewRequest: { kind: 'fit', seq: state.viewRequest.seq + 1 } };
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

/**
 * Fold duplicate records into one paper: gaps in the kept record are filled from the others,
 * references to the others point at the kept paper, and their manual and cluster edges move over.
 */
function mergePapers(state: MindMapState, keepId: string, mergeIds: string[]): MindMapState {
  const drop = new Set(mergeIds.filter((id) => id !== keepId));
  const keepNode = state.nodes.find((n): n is PaperNode => n.id === keepId && isPaperNode(n));
  const others = state.nodes.filter((n): n is PaperNode => drop.has(n.id) && isPaperNode(n)).map((n) => n.data.paper);
  if (!keepNode || others.length === 0) return state;
  const remap = (id: string) => (drop.has(id) ? keepId : id);
  const refsOf = (p: Paper, extra: string[] = []) => [...new Set([...p.references, ...extra].map(remap))].filter((r) => r !== p.id);
  const kept = mergePaperRecords(keepNode.data.paper, others);
  kept.references = refsOf(keepNode.data.paper, others.flatMap((o) => o.references));
  const nodes = state.nodes
    .filter((n) => !drop.has(n.id))
    .map((n) => {
      if (n.id === keepId) return updatePaper(n, () => kept);
      return isPaperNode(n) && n.data.paper.references.some((r) => drop.has(r)) ? updatePaper(n, (p) => ({ ...p, references: refsOf(p) })) : n;
    });
  const seen = new Set<string>();
  const moved = state.edges
    .filter((e) => !isCitationEdge(e))
    .map((e) => {
      if (!drop.has(e.source) && !drop.has(e.target)) return e;
      const source = remap(e.source);
      const target = remap(e.target);
      const id = e.id.startsWith(GROUP_EDGE_PREFIX) ? `${GROUP_EDGE_PREFIX}${source}-${target}` : e.id;
      return { ...e, id, source, target };
    })
    .filter((e) => {
      const key = `${e.data?.relationship ?? ''}|${e.source}|${e.target}`;
      if (e.source === e.target || seen.has(key) || seen.has(e.id)) return false;
      seen.add(key);
      seen.add(e.id);
      return true;
    });
  const selected = state.selectedNodeId && drop.has(state.selectedNodeId) ? keepId : state.selectedNodeId;
  return { ...state, nodes, edges: rebuildEdges(nodes, moved), selectedNodeId: selected };
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
    aspects: snapshot.aspects ?? [],
    history: snapshot.history ?? [],
  };
}

export function mindMapReducer(state: MindMapState, action: MindMapAction): MindMapState {
  switch (action.type) {
    // Applied to the state as it is now, not to the nodes the component last rendered:
    // a change reported right after a project switch must not bring the old map back.
    case 'NODE_CHANGES':
      return { ...state, nodes: applyNodeChanges(action.payload, state.nodes) };

    case 'EDGE_CHANGES':
      return { ...state, edges: applyEdgeChanges(action.payload, state.edges) };

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

    case 'ADD_HISTORY': {
      const e = action.payload;
      // Re-running a search moves it to the top (keeping its pin) instead of duplicating it.
      const same = state.history.find((h) => h.kind === e.kind && h.text === e.text);
      const rest = state.history.filter((h) => h !== same);
      const unpinned = rest.filter((h) => !h.pinned);
      const trimmed = [...rest.filter((h) => h.pinned), ...unpinned.slice(0, HISTORY_LIMIT - 1)];
      const kept = state.history.filter((h) => trimmed.includes(h));
      // Running it again means its results were seen; keep what was seen before too.
      return { ...state, history: [{ ...e, pinned: same?.pinned, seen: mergeSeen(same?.seen, e.seen ?? []), checkedAt: same?.checkedAt }, ...kept] };
    }

    case 'PIN_HISTORY':
      return {
        ...state,
        history: state.history.map((h) => (h.id === action.payload ? { ...h, pinned: !h.pinned } : h)),
      };

    case 'UPDATE_HISTORY':
      return {
        ...state,
        history: state.history.map((h) => (h.id === action.payload.id ? { ...h, ...action.payload.patch } : h)),
      };

    case 'REMOVE_HISTORY':
      return { ...state, history: state.history.filter((h) => h.id !== action.payload) };

    case 'SET_ASPECTS': {
      const aspects = [...new Set(action.payload.map((a) => a.trim()).filter(Boolean))];
      return { ...state, aspects };
    }

    case 'RENAME_ASPECT': {
      const from = action.payload.from;
      const to = action.payload.to.trim();
      if (!to || to === from || state.aspects.includes(to) || !state.aspects.includes(from)) return state;
      return {
        ...state,
        aspects: state.aspects.map((a) => (a === from ? to : a)),
        nodes: state.nodes.map((n) =>
          isPaperNode(n) && n.data.paper.comparison && from in n.data.paper.comparison
            ? updatePaper(n, (p) => {
                const comparison = { ...p.comparison };
                comparison[to] = comparison[from];
                delete comparison[from];
                return { ...p, comparison };
              })
            : n,
        ),
      };
    }

    case 'SET_ASPECT_VALUES': {
      const { aspect, values } = action.payload;
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id in values ? updatePaper(n, (p) => ({ ...p, comparison: { ...p.comparison, [aspect]: values[n.id] } })) : n,
        ),
      };
    }

    case 'RENAME_CLUSTERS': {
      const names = action.payload;
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.type === 'cluster' && names[n.id]?.trim() ? { ...n, data: { ...n.data, label: names[n.id].trim() } } : n,
        ),
      };
    }

    case 'UPDATE_PAPER_META': {
      // Reading status, tags, notes, rating: no effect on edges.
      const { id, patch } = action.payload;
      const safe = { ...patch };
      delete safe.id;
      delete safe.references;
      return { ...state, nodes: state.nodes.map((n) => (n.id === id ? updatePaper(n, (p) => ({ ...p, ...safe })) : n)) };
    }

    case 'ADD_PAPERS':
      return addPapers(state, action.payload.papers, action.payload.center);

    case 'MERGE_PAPERS':
      return mergePapers(state, action.payload.keepId, action.payload.mergeIds);

    case 'ADD_NOTE': {
      const { id, position, color } = action.payload;
      const node: MapNode = { id, type: 'note', position, data: { text: '', color: color ?? 'yellow' } };
      return { ...state, nodes: [...state.nodes, node], selectedNodeId: id };
    }

    case 'DISCARD_NOTE':
      return deletePapers(state, [action.payload]);

    case 'UPDATE_NOTE': {
      const { id, patch } = action.payload;
      return {
        ...state,
        nodes: state.nodes.map((n) => (n.id === id && n.type === 'note' ? { ...n, data: { ...n.data, ...patch } } : n)),
      };
    }

    case 'RENAME_TAG': {
      // Renaming onto an existing tag merges them; `to: null` removes the tag.
      const { from, to } = action.payload;
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          isPaperNode(n) && n.data.paper.tags?.includes(from)
            ? updatePaper(n, (p) => {
                const tags = [...new Set(p.tags!.map((t) => (t === from ? to : t)).filter((t): t is string => !!t))];
                return { ...p, tags: tags.length ? tags : undefined };
              })
            : n,
        ),
      };
    }

    case 'ADD_LINKED_PAPERS':
      return addLinkedPapers(state, action.payload.anchorId, action.payload.papers, action.payload.kind);

    case 'IMPORT_GRAPH':
      return importGraph(state, action.payload.nodes, action.payload.edges);

    case 'REQUEST_VIEW':
      return { ...state, viewRequest: { kind: action.payload, seq: state.viewRequest.seq + 1 } };

    default:
      return state;
  }
}
