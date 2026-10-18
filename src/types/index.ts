import type { Node, Edge } from '@xyflow/react';
import type { ExpandKind, Paper } from '../../shared/types';

export type { Paper } from '../../shared/types';

/** Which side of its parent a node sits on in the mind map layout. */
export type MapSide = 'left' | 'right';

export interface PaperNodeData extends Record<string, unknown> {
  paper: Paper;
  isExpanded: boolean;
  side?: MapSide;
  /** Cluster color when the paper belongs to a generated cluster. */
  accent?: string;
}

export type PaperNode = Node<PaperNodeData, 'paper'>;

/** Root of a generated map: the search that produced it. */
export interface QueryRootData extends Record<string, unknown> {
  query: string;
  mode: 'query' | 'vague';
  paperCount: number;
  createdAt: string;
}

export type QueryRootNode = Node<QueryRootData, 'query'>;

export interface ClusterNodeData extends Record<string, unknown> {
  label: string;
  level: string;
  size: number;
  color: string;
  side?: MapSide;
}

export type ClusterNode = Node<ClusterNodeData, 'cluster'>;

export type MapNode = PaperNode | QueryRootNode | ClusterNode;

export interface PaperEdgeData extends Record<string, unknown> {
  relationship: string;
}

export type PaperEdge = Edge<PaperEdgeData>;

export type LayoutDirection = 'TB' | 'LR';

export type SidebarMode = 'closed' | 'search' | 'library' | 'write' | 'compare' | 'screen' | 'add' | 'edit';

export interface MindMapState {
  nodes: MapNode[];
  edges: PaperEdge[];
  selectedNodeId: string | null;
  sidebarMode: SidebarMode;
  layoutDirection: LayoutDirection;
  /** Bumped when the canvas should re-run auto layout or fit the view. */
  viewRequest: ViewRequest;
  /** Comparison-table columns, in order. */
  aspects: string[];
  /** Searches run in this project, newest first. */
  history: HistoryEntry[];
}

export interface HistoryEntry {
  id: string;
  kind: 'query' | 'vague';
  text: string;
  at: string;
  resultCount: number;
  pinned?: boolean;
  /** Keys (id, doi:, openalex:) of results already seen, for new-paper alerts. */
  seen?: string[];
  /** Last time this saved search was checked for new papers. */
  checkedAt?: string;
}

export interface ViewRequest {
  kind: 'layout' | 'fit';
  seq: number;
}

export interface MapSnapshot {
  nodes: MapNode[];
  edges: PaperEdge[];
  layoutDirection: LayoutDirection;
  aspects?: string[];
  history?: HistoryEntry[];
}

export type MindMapAction =
  | { type: 'SET_NODES'; payload: MapNode[] }
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
  | { type: 'APPLY_LAYOUT'; payload: { nodes: MapNode[]; edges: PaperEdge[] }; /** false for automatic layouts (load, import) */ record?: boolean }
  | { type: 'LOAD_MAP'; payload: MapSnapshot }
  | { type: 'IMPORT_GRAPH'; payload: { nodes: MapNode[]; edges: PaperEdge[] } }
  | { type: 'ADD_HISTORY'; payload: HistoryEntry }
  | { type: 'PIN_HISTORY'; payload: string }
  | { type: 'UPDATE_HISTORY'; payload: { id: string; patch: Partial<Pick<HistoryEntry, 'seen' | 'checkedAt'>> } }
  | { type: 'REMOVE_HISTORY'; payload: string }
  | { type: 'SET_ASPECTS'; payload: string[] }
  | { type: 'RENAME_ASPECT'; payload: { from: string; to: string } }
  | { type: 'SET_ASPECT_VALUES'; payload: { aspect: string; values: Record<string, string> } }
  | { type: 'RENAME_CLUSTERS'; payload: Record<string, string> }
  | { type: 'UPDATE_PAPER_META'; payload: { id: string; patch: Partial<Paper> } }
  | { type: 'ADD_PAPERS'; payload: { papers: Paper[]; center: { x: number; y: number } } }
  | { type: 'ADD_LINKED_PAPERS'; payload: { anchorId: string; papers: Paper[]; kind: ExpandKind } }
  | { type: 'REQUEST_VIEW'; payload: ViewRequest['kind'] };

export function isPaperNode(node: MapNode): node is PaperNode {
  return node.type === 'paper';
}
