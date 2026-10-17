import { useReducer, useCallback } from 'react';
import type { PaperNode, Paper, SidebarMode } from '../types';
import { buildCitationEdges, mindMapReducer } from '../store/mindMapReducer';

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
