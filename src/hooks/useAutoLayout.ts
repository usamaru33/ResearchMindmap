import { useCallback } from 'react';
import { getLayoutedElements } from '../utils/layout';
import type { MapNode, PaperEdge, LayoutDirection } from '../types';

/**
 * Compute a layout. Fitting the view is left to the caller, which must wait
 * until the new positions are rendered (fitting earlier zooms onto the old,
 * often stacked, positions).
 */
export function useAutoLayout() {
  const applyLayout = useCallback(
    (nodes: MapNode[], edges: PaperEdge[], direction: LayoutDirection = 'LR') =>
      getLayoutedElements(nodes, edges, direction),
    [],
  );
  return { applyLayout };
}
