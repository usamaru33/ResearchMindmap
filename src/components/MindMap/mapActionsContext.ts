import { createContext, useContext } from 'react';

/** Actions custom nodes can trigger without receiving dispatch through props. */
export interface MapActions {
  renameCluster: (id: string, label: string) => void;
}

export const MapActionsContext = createContext<MapActions>({ renameCluster: () => {} });

export function useMapActions(): MapActions {
  return useContext(MapActionsContext);
}
