import type { Node, Edge } from '@xyflow/react';
import type { Paper } from '../../shared/types';

export type { Paper } from '../../shared/types';

export interface PaperNodeData extends Record<string, unknown> {
  paper: Paper;
  isExpanded: boolean;
}

export type PaperNode = Node<PaperNodeData, 'paper'>;

export interface PaperEdgeData extends Record<string, unknown> {
  relationship: string;
}

export type PaperEdge = Edge<PaperEdgeData>;

export type LayoutDirection = 'TB' | 'LR';

export type SidebarMode = 'closed' | 'search' | 'add' | 'edit';

export interface MindMapState {
  nodes: PaperNode[];
  edges: PaperEdge[];
  selectedNodeId: string | null;
  sidebarMode: SidebarMode;
  layoutDirection: LayoutDirection;
  /** Bumped when the canvas should re-run auto layout or fit the view. */
  viewRequest: ViewRequest;
}

export interface ViewRequest {
  kind: 'layout' | 'fit';
  seq: number;
}

export interface MapSnapshot {
  nodes: PaperNode[];
  edges: PaperEdge[];
  layoutDirection: LayoutDirection;
}

export type MindMapAction =
  | { type: 'SET_NODES'; payload: PaperNode[] }
  | { type: 'SET_EDGES'; payload: PaperEdge[] }
  | { type: 'ADD_PAPER'; payload: { paper: Paper; position: { x: number; y: number } } }
  | { type: 'UPDATE_PAPER'; payload: Paper }
  | { type: 'DELETE_PAPER'; payload: string }
  | { type: 'DELETE_PAPERS'; payload: string[] }
  | { type: 'TOGGLE_EXPAND'; payload: string }
  | { type: 'ADD_CONNECTION'; payload: { id: string; source: string; target: string; relationship: string } }
  | { type: 'REMOVE_CONNECTION'; payload: string }
  | { type: 'REMOVE_CONNECTIONS'; payload: string[] }
  | { type: 'SELECT_NODE'; payload: string | null }
  | { type: 'SET_SIDEBAR_MODE'; payload: SidebarMode }
  | { type: 'SET_LAYOUT_DIRECTION'; payload: 'TB' | 'LR' }
  | { type: 'APPLY_LAYOUT'; payload: { nodes: PaperNode[]; edges: PaperEdge[] } }
  | { type: 'LOAD_MAP'; payload: MapSnapshot }
  | { type: 'REQUEST_VIEW'; payload: ViewRequest['kind'] };
