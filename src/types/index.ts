import type { Node, Edge } from '@xyflow/react';

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  belongs: string;
  year: number;
  venue: string;
  abstract: string;
  challenges: string;
  futureWork: string;
  references: string[];
  thumbnailUrl?: string;
}

export interface PaperNodeData extends Record<string, unknown> {
  paper: Paper;
  isExpanded: boolean;
}

export type PaperNode = Node<PaperNodeData, 'paper'>;

export interface PaperEdgeData extends Record<string, unknown> {
  relationship: string;
}

export type PaperEdge = Edge<PaperEdgeData>;

export type SidebarMode = 'closed' | 'add' | 'edit';

export interface MindMapState {
  nodes: PaperNode[];
  edges: PaperEdge[];
  selectedNodeId: string | null;
  sidebarMode: SidebarMode;
  layoutDirection: 'TB' | 'LR';
}

export type MindMapAction =
  | { type: 'SET_NODES'; payload: PaperNode[] }
  | { type: 'SET_EDGES'; payload: PaperEdge[] }
  | { type: 'ADD_PAPER'; payload: { paper: Paper; position: { x: number; y: number } } }
  | { type: 'UPDATE_PAPER'; payload: Paper }
  | { type: 'DELETE_PAPER'; payload: string }
  | { type: 'TOGGLE_EXPAND'; payload: string }
  | { type: 'ADD_CONNECTION'; payload: { id: string; source: string; target: string; relationship: string } }
  | { type: 'REMOVE_CONNECTION'; payload: string }
  | { type: 'SELECT_NODE'; payload: string | null }
  | { type: 'SET_SIDEBAR_MODE'; payload: SidebarMode }
  | { type: 'SET_LAYOUT_DIRECTION'; payload: 'TB' | 'LR' }
  | { type: 'APPLY_LAYOUT'; payload: { nodes: PaperNode[]; edges: PaperEdge[] } };
