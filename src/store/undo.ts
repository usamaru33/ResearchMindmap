import type { MindMapAction, MindMapState } from '../types';

/** The part of the state that undo/redo restores (the map document). */
type Doc = Pick<MindMapState, 'nodes' | 'edges' | 'aspects' | 'layoutDirection'>;

export interface UndoState {
  present: MindMapState;
  past: Doc[];
  future: Doc[];
}

export type UndoAction = MindMapAction | { type: 'UNDO' } | { type: 'REDO' } | { type: 'CHECKPOINT' };

const LIMIT = 100;

// Actions that change the document and should be undoable in one step.
// NODE_CHANGES / EDGE_CHANGES are excluded: they fire continuously during drags and
// for measurements; a drag is recorded once via CHECKPOINT at drag start.
const RECORDED = new Set<MindMapAction['type']>([
  'ADD_PAPER',
  'UPDATE_PAPER',
  'DELETE_PAPER',
  'DELETE_PAPERS',
  'ADD_CONNECTION',
  'REMOVE_CONNECTION',
  'REMOVE_CONNECTIONS',
  'APPLY_LAYOUT',
  'IMPORT_GRAPH',
  'ADD_LINKED_PAPERS',
  'ADD_PAPERS',
  'MERGE_PAPERS',
  'RENAME_TAG',
  // ADD_NOTE is not recorded: a new note is a draft until its first text (UPDATE_NOTE).
  'UPDATE_NOTE',
  'UPDATE_PAPER_META',
  'RENAME_CLUSTERS',
  'SET_ASPECTS',
  'RENAME_ASPECT',
  'SET_ASPECT_VALUES',
  'SET_LAYOUT_DIRECTION',
]);

/** The undoable document. Empty notes are drafts being typed, so history never brings them back. */
function docOf(s: MindMapState): Doc {
  const drafts = new Set(s.nodes.filter((n) => n.type === 'note' && !n.data.text.trim()).map((n) => n.id));
  const nodes = drafts.size ? s.nodes.filter((n) => !drafts.has(n.id)) : s.nodes;
  const edges = drafts.size ? s.edges.filter((e) => !drafts.has(e.source) && !drafts.has(e.target)) : s.edges;
  return { nodes, edges, aspects: s.aspects, layoutDirection: s.layoutDirection };
}

/** Restore a document; drop a selection that no longer exists. */
function restore(s: MindMapState, doc: Doc): MindMapState {
  const selected = s.selectedNodeId && doc.nodes.some((n) => n.id === s.selectedNodeId) ? s.selectedNodeId : null;
  return { ...s, ...doc, selectedNodeId: selected, sidebarMode: selected || s.sidebarMode !== 'edit' ? s.sidebarMode : 'closed' };
}

export function initUndoState(present: MindMapState): UndoState {
  return { present, past: [], future: [] };
}

export function withUndo(reducer: (s: MindMapState, a: MindMapAction) => MindMapState) {
  return (state: UndoState, action: UndoAction): UndoState => {
    switch (action.type) {
      case 'UNDO': {
        const prev = state.past.at(-1);
        if (!prev) return state;
        return { present: restore(state.present, prev), past: state.past.slice(0, -1), future: [docOf(state.present), ...state.future] };
      }
      case 'REDO': {
        const next = state.future[0];
        if (!next) return state;
        return { present: restore(state.present, next), past: [...state.past, docOf(state.present)], future: state.future.slice(1) };
      }
      case 'CHECKPOINT':
        return { ...state, past: [...state.past, docOf(state.present)].slice(-LIMIT), future: [] };
      case 'LOAD_MAP':
        // A different project: its own, empty history.
        return { present: reducer(state.present, action), past: [], future: [] };
      default: {
        const present = reducer(state.present, action);
        if (present === state.present) return state;
        if (!RECORDED.has(action.type)) return { ...state, present };
        // Automatic layouts after a load or import are part of that step, not their own.
        if (action.type === 'APPLY_LAYOUT' && action.record === false) return { ...state, present };
        return { present, past: [...state.past, docOf(state.present)].slice(-LIMIT), future: [] };
      }
    }
  };
}
