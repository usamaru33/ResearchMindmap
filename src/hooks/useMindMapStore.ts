import { useReducer, useCallback, useMemo } from 'react';
import { isPaperNode, type MapSnapshot, type Paper } from '../types';
import { initMindMapState, mindMapReducer } from '../store/mindMapReducer';

export function useMindMapStore(initialMap: MapSnapshot) {
  const [state, dispatch] = useReducer(mindMapReducer, initialMap, initMindMapState);

  const papers = useMemo(() => state.nodes.filter(isPaperNode).map((n) => n.data.paper), [state.nodes]);
  const byId = useMemo(() => new Map(papers.map((p) => [p.id, p])), [papers]);

  const getSelectedPaper = useCallback(() => {
    if (!state.selectedNodeId) return null;
    return byId.get(state.selectedNodeId) ?? null;
  }, [state.selectedNodeId, byId]);

  const getAllPapers = useCallback(() => papers, [papers]);

  const getCitedBy = useCallback(
    (paperId: string) => papers.filter((p) => p.references.includes(paperId)),
    [papers],
  );

  const getReferences = useCallback(
    (paperId: string) => {
      const paper = byId.get(paperId);
      if (!paper) return [];
      return paper.references.map((refId) => byId.get(refId)).filter((p): p is Paper => p !== undefined);
    },
    [byId],
  );

  return { state, dispatch, getSelectedPaper, getAllPapers, getCitedBy, getReferences };
}
