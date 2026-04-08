import { useReducer, useCallback } from 'react';
import type { MindMapState, MindMapAction, PaperNode, PaperEdge, Paper, SidebarMode } from '../types';
import { getEdgeStyle } from '../utils/helpers';
import { MarkerType } from '@xyflow/react';

function createPaperNode(paper: Paper, position: { x: number; y: number }): PaperNode {
  return {
    id: paper.id,
    type: 'paper',
    position,
    data: { paper, isExpanded: false },
  };
}

function createStyledEdge(id: string, source: string, target: string, relationship: string): PaperEdge {
  const style = getEdgeStyle(relationship);
  return {
    id,
    source,
    target,
    type: 'smoothstep',
    animated: style.animated,
    style: { stroke: style.stroke, strokeWidth: style.strokeWidth },
    label: relationship,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: style.stroke },
    data: { relationship },
  };
}

/** Build citation edges from all papers' references fields.
 *  Edge direction: referenced paper (source) → citing paper (target)
 *  so the graph branches out from seminal papers to derived works. */
function buildCitationEdges(nodes: PaperNode[]): PaperEdge[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: PaperEdge[] = [];
  for (const node of nodes) {
    const paper = node.data.paper;
    for (const refId of paper.references) {
      if (nodeIds.has(refId)) {
        edges.push(
          createStyledEdge(`cite-${refId}-${paper.id}`, refId, paper.id, 'cites'),
        );
      }
    }
  }
  return edges;
}

/** Get non-citation (manually added) edges */
function getManualEdges(edges: PaperEdge[]): PaperEdge[] {
  return edges.filter((e) => !e.id.startsWith('cite-'));
}

function rebuildEdges(nodes: PaperNode[], currentEdges: PaperEdge[]): PaperEdge[] {
  const manual = getManualEdges(currentEdges);
  const citation = buildCitationEdges(nodes);
  return [...citation, ...manual];
}

function mindMapReducer(state: MindMapState, action: MindMapAction): MindMapState {
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
      const newNodes = state.nodes.map((n) =>
        n.id === updated.id ? { ...n, data: { ...n.data, paper: updated } } : n,
      );
      return { ...state, nodes: newNodes, edges: rebuildEdges(newNodes, state.edges) };
    }

    case 'DELETE_PAPER': {
      const id = action.payload;
      const newNodes = state.nodes.filter((n) => n.id !== id);
      // Also remove this paper from other papers' references
      const cleanedNodes = newNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          paper: {
            ...n.data.paper,
            references: n.data.paper.references.filter((r) => r !== id),
          },
        },
      }));
      return {
        ...state,
        nodes: cleanedNodes,
        edges: rebuildEdges(cleanedNodes, state.edges.filter((e) => e.source !== id && e.target !== id)),
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
        sidebarMode: state.selectedNodeId === id ? 'closed' : state.sidebarMode,
      };
    }

    case 'TOGGLE_EXPAND':
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === action.payload ? { ...n, data: { ...n.data, isExpanded: !n.data.isExpanded } } : n,
        ),
      };

    case 'ADD_CONNECTION': {
      const { id, source, target, relationship } = action.payload;
      const edge = createStyledEdge(id, source, target, relationship);
      return { ...state, edges: [...state.edges, edge] };
    }

    case 'REMOVE_CONNECTION':
      return { ...state, edges: state.edges.filter((e) => e.id !== action.payload) };

    case 'SELECT_NODE':
      return { ...state, selectedNodeId: action.payload };

    case 'SET_SIDEBAR_MODE':
      return { ...state, sidebarMode: action.payload };

    case 'SET_LAYOUT_DIRECTION':
      return { ...state, layoutDirection: action.payload };

    case 'APPLY_LAYOUT':
      return { ...state, nodes: action.payload.nodes, edges: action.payload.edges };

    default:
      return state;
  }
}

export function useMindMapStore(initialNodes: PaperNode[]) {
  const initialEdges = buildCitationEdges(initialNodes);

  const [state, dispatch] = useReducer(mindMapReducer, {
    nodes: initialNodes,
    edges: initialEdges,
    selectedNodeId: null,
    sidebarMode: 'closed' as SidebarMode,
    layoutDirection: 'LR' as const,
  });

  const getSelectedPaper = useCallback(() => {
    if (!state.selectedNodeId) return null;
    const node = state.nodes.find((n) => n.id === state.selectedNodeId);
    return node?.data.paper ?? null;
  }, [state.selectedNodeId, state.nodes]);

  const getAllPapers = useCallback(() => {
    return state.nodes.map((n) => n.data.paper);
  }, [state.nodes]);

  const getCitedBy = useCallback(
    (paperId: string) => {
      return state.nodes
        .filter((n) => n.data.paper.references.includes(paperId))
        .map((n) => n.data.paper);
    },
    [state.nodes],
  );

  const getReferences = useCallback(
    (paperId: string) => {
      const paper = state.nodes.find((n) => n.id === paperId)?.data.paper;
      if (!paper) return [];
      return paper.references
        .map((refId) => state.nodes.find((n) => n.id === refId)?.data.paper)
        .filter((p): p is Paper => p !== undefined);
    },
    [state.nodes],
  );

  return { state, dispatch, getSelectedPaper, getAllPapers, getCitedBy, getReferences };
}
