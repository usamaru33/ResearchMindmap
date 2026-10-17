import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { getLayoutedElements } from '../utils/layout';
import type { PaperNode, PaperEdge, LayoutDirection } from '../types';

export function useAutoLayout() {
  const { fitView } = useReactFlow();

  const applyLayout = useCallback(
    (nodes: PaperNode[], edges: PaperEdge[], direction: LayoutDirection = 'LR') => {
      const result = getLayoutedElements(nodes, edges, direction);
      window.requestAnimationFrame(() => {
        fitView({ padding: 0.2, duration: 300 });
      });
      return result;
    },
    [fitView],
  );

  return { applyLayout };
}
