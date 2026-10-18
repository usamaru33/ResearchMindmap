import { createContext, useContext } from 'react';
import type { NoteNodeData } from '../../types';

/** Actions custom nodes can trigger without receiving dispatch through props. */
export interface MapActions {
  renameCluster: (id: string, label: string) => void;
  updateNote: (id: string, patch: Partial<NoteNodeData>) => void;
  /** `discard`: the note was never filled in, so its removal is not an undo step. */
  removeNote: (id: string, discard: boolean) => void;
}

export const MapActionsContext = createContext<MapActions>({ renameCluster: () => {}, updateNote: () => {}, removeNote: () => {} });

export function useMapActions(): MapActions {
  return useContext(MapActionsContext);
}
