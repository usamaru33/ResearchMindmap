import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { createPaperNode, initMindMapState, mindMapReducer } from './mindMapReducer';
import { initUndoState, withUndo } from './undo';

const reducer = withUndo(mindMapReducer);
const start = () =>
  initUndoState(
    initMindMapState({
      nodes: [createPaperNode(makePaper({ id: 'a', title: 'A' }), { x: 0, y: 0 }), createPaperNode(makePaper({ id: 'b', title: 'B' }), { x: 0, y: 0 })],
      edges: [],
      layoutDirection: 'LR',
    }),
  );
const ids = (s: ReturnType<typeof start>) => s.present.nodes.map((n) => n.id);

describe('undo/redo', () => {
  it('undoes and redoes document changes', () => {
    let s = start();
    s = reducer(s, { type: 'DELETE_PAPER', payload: 'a' });
    s = reducer(s, { type: 'ADD_PAPER', payload: { paper: makePaper({ id: 'c', title: 'C' }), position: { x: 0, y: 0 } } });
    expect(ids(s)).toEqual(['b', 'c']);
    s = reducer(s, { type: 'UNDO' });
    expect(ids(s)).toEqual(['b']);
    s = reducer(s, { type: 'UNDO' });
    expect(ids(s)).toEqual(['a', 'b']);
    s = reducer(s, { type: 'UNDO' });
    expect(ids(s)).toEqual(['a', 'b']);
    s = reducer(s, { type: 'REDO' });
    expect(ids(s)).toEqual(['b']);
  });

  it('does not record selection, panels or continuous node updates', () => {
    let s = start();
    s = reducer(s, { type: 'SELECT_NODE', payload: 'a' });
    s = reducer(s, { type: 'SET_SIDEBAR_MODE', payload: 'library' });
    s = reducer(s, { type: 'NODE_CHANGES', payload: s.present.nodes.map((n) => ({ type: 'position', id: n.id, position: { x: 5, y: 5 } })) });
    expect(s.past).toHaveLength(0);
  });

  it('records a drag once through a checkpoint', () => {
    let s = start();
    s = reducer(s, { type: 'CHECKPOINT' });
    for (let i = 1; i <= 3; i++) s = reducer(s, { type: 'NODE_CHANGES', payload: s.present.nodes.map((n) => ({ type: 'position', id: n.id, position: { x: i, y: 0 } })) });
    s = reducer(s, { type: 'UNDO' });
    expect(s.present.nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('clears redo after a new change and resets on project load', () => {
    let s = start();
    s = reducer(s, { type: 'DELETE_PAPER', payload: 'a' });
    s = reducer(s, { type: 'UNDO' });
    s = reducer(s, { type: 'DELETE_PAPER', payload: 'b' });
    expect(s.future).toHaveLength(0);
    s = reducer(s, { type: 'LOAD_MAP', payload: { nodes: [], edges: [], layoutDirection: 'LR' } });
    expect(s.past).toHaveLength(0);
  });

  it('clears a selection that undo removes', () => {
    let s = start();
    s = reducer(s, { type: 'ADD_PAPER', payload: { paper: makePaper({ id: 'c', title: 'C' }), position: { x: 0, y: 0 } } });
    s = reducer(s, { type: 'SELECT_NODE', payload: 'c' });
    s = reducer(s, { type: 'UNDO' });
    expect(s.present.selectedNodeId).toBeNull();
  });
});

describe('automatic layouts', () => {
  it('are not separate undo steps', () => {
    let s = start();
    s = reducer(s, { type: 'APPLY_LAYOUT', payload: { nodes: s.present.nodes, edges: [] }, record: false });
    expect(s.past).toHaveLength(0);
    s = reducer(s, { type: 'APPLY_LAYOUT', payload: { nodes: s.present.nodes.map((n) => ({ ...n, position: { x: 9, y: 9 } })), edges: [] } });
    expect(s.past).toHaveLength(1);
  });
});

describe('undo and notes', () => {
  it('never brings back an empty draft note', () => {
    const base = initMindMapState({ nodes: [], edges: [], layoutDirection: 'LR' });
    const reduce = withUndo(mindMapReducer);
    let s = initUndoState(base);
    s = reduce(s, { type: 'ADD_NOTE', payload: { id: 'n1', position: { x: 0, y: 0 } } });
    expect(s.past).toHaveLength(0);
    s = reduce(s, { type: 'UPDATE_NOTE', payload: { id: 'n1', patch: { text: 'idea' } } });
    s = reduce(s, { type: 'UNDO' });
    expect(s.present.nodes).toEqual([]);
    s = reduce(s, { type: 'REDO' });
    expect(s.present.nodes.map((n) => n.data)).toEqual([{ text: 'idea', color: 'yellow' }]);
    s = reduce(s, { type: 'ADD_NOTE', payload: { id: 'n2', position: { x: 0, y: 0 } } });
    s = reduce(s, { type: 'DISCARD_NOTE', payload: 'n2' });
    expect(s.past).toHaveLength(1);
  });
});
