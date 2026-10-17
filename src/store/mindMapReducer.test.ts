import { describe, expect, it } from 'vitest';
import type { MindMapState, Paper } from '../types';
import { buildCitationEdges, createPaperNode, mindMapReducer } from './mindMapReducer';

function paper(id: string, references: string[] = []): Paper {
  return {
    id,
    title: id,
    authors: [],
    belongs: '',
    year: 2020,
    venue: '',
    abstract: '',
    challenges: '',
    futureWork: '',
    references,
  };
}

function stateOf(papers: Paper[]): MindMapState {
  const nodes = papers.map((p) => createPaperNode(p, { x: 0, y: 0 }));
  return {
    nodes,
    edges: buildCitationEdges(nodes),
    selectedNodeId: null,
    sidebarMode: 'closed',
    layoutDirection: 'LR',
  };
}

const refsOf = (s: MindMapState, id: string) => s.nodes.find((n) => n.id === id)?.data.paper.references;

describe('mindMapReducer', () => {
  it('builds citation edges from references (cited → citing)', () => {
    const s = stateOf([paper('a'), paper('b', ['a'])]);
    expect(s.edges).toHaveLength(1);
    expect(s.edges[0]).toMatchObject({ id: 'cite-a-b', source: 'a', target: 'b' });
  });

  it('removing a citation edge also drops the reference so it is not regenerated', () => {
    let s = stateOf([paper('a'), paper('b', ['a']), paper('c')]);
    s = mindMapReducer(s, { type: 'REMOVE_CONNECTIONS', payload: ['cite-a-b'] });
    expect(s.edges).toHaveLength(0);
    expect(refsOf(s, 'b')).toEqual([]);

    // Any later rebuild (e.g. adding a paper) must not bring it back.
    s = mindMapReducer(s, { type: 'ADD_PAPER', payload: { paper: paper('d'), position: { x: 0, y: 0 } } });
    expect(s.edges.find((e) => e.id === 'cite-a-b')).toBeUndefined();
  });

  it('removes citation edges whose ids contain dashes using edge endpoints', () => {
    const a = '0f8c-uuid-like';
    const b = 'another-uuid';
    let s = stateOf([paper(a), paper(b, [a])]);
    s = mindMapReducer(s, { type: 'REMOVE_CONNECTION', payload: `cite-${a}-${b}` });
    expect(refsOf(s, b)).toEqual([]);
  });

  it('removing a manual edge leaves references untouched', () => {
    let s = stateOf([paper('a'), paper('b', ['a'])]);
    s = mindMapReducer(s, {
      type: 'ADD_CONNECTION',
      payload: { id: 'e-1', source: 'a', target: 'b', relationship: 'extends' },
    });
    s = mindMapReducer(s, { type: 'REMOVE_CONNECTIONS', payload: ['e-1'] });
    expect(s.edges.map((e) => e.id)).toEqual(['cite-a-b']);
    expect(refsOf(s, 'b')).toEqual(['a']);
  });

  it('deleting papers cleans references, edges and selection', () => {
    let s = stateOf([paper('a'), paper('b', ['a']), paper('c', ['a', 'b'])]);
    s = mindMapReducer(s, {
      type: 'ADD_CONNECTION',
      payload: { id: 'e-1', source: 'a', target: 'c', relationship: 'extends' },
    });
    s = mindMapReducer(s, { type: 'SELECT_NODE', payload: 'a' });
    s = mindMapReducer(s, { type: 'SET_SIDEBAR_MODE', payload: 'edit' });
    s = mindMapReducer(s, { type: 'DELETE_PAPERS', payload: ['a'] });

    expect(s.nodes.map((n) => n.id)).toEqual(['b', 'c']);
    expect(refsOf(s, 'b')).toEqual([]);
    expect(refsOf(s, 'c')).toEqual(['b']);
    expect(s.edges.map((e) => e.id)).toEqual(['cite-b-c']);
    expect(s.selectedNodeId).toBeNull();
    expect(s.sidebarMode).toBe('closed');
  });

  it('keeps the add-paper sidebar open when deleting an unrelated selection', () => {
    let s = stateOf([paper('a'), paper('b')]);
    s = mindMapReducer(s, { type: 'SELECT_NODE', payload: 'a' });
    s = mindMapReducer(s, { type: 'SET_SIDEBAR_MODE', payload: 'add' });
    s = mindMapReducer(s, { type: 'DELETE_PAPER', payload: 'a' });
    expect(s.sidebarMode).toBe('add');
  });

  it('ignores self connections', () => {
    const s = stateOf([paper('a')]);
    const next = mindMapReducer(s, {
      type: 'ADD_CONNECTION',
      payload: { id: 'e-1', source: 'a', target: 'a', relationship: 'extends' },
    });
    expect(next).toBe(s);
  });

  it('updating references regenerates citation edges', () => {
    let s = stateOf([paper('a'), paper('b')]);
    s = mindMapReducer(s, { type: 'UPDATE_PAPER', payload: paper('b', ['a']) });
    expect(s.edges.map((e) => e.id)).toEqual(['cite-a-b']);
  });
});
