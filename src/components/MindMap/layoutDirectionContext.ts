import { createContext, useContext } from 'react';
import { Position } from '@xyflow/react';
import type { LayoutDirection } from '../../types';

export const LayoutDirectionContext = createContext<LayoutDirection>('LR');

/** Handle positions for the current layout: incoming edges on the leading side. */
export function useHandlePositions(): { target: Position; source: Position } {
  const direction = useContext(LayoutDirectionContext);
  return direction === 'TB'
    ? { target: Position.Top, source: Position.Bottom }
    : { target: Position.Left, source: Position.Right };
}
