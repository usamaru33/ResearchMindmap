import { describe, expect, it } from 'vitest';
import { isPaperNode, type MindMapState, type Paper } from '../types';
import { buildCitationEdges, createPaperNode, initMindMapState, mindMapReducer } from './mindMapReducer';

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
    viewRequest: { kind: 'fit', seq: 0 },
    aspects: [],
    history: [],
  };
}

const refsOf = (s: MindMapState, id: string) =>
  s.nodes.filter(isPaperNode).find((n) => n.id === id)?.data.paper.references;

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

  it('LOAD_MAP replaces the map, clears selection and requests layout for unplaced nodes', () => {
    let s = stateOf([paper('a')]);
    s = mindMapReducer(s, { type: 'SELECT_NODE', payload: 'a' });
    const nodes = [createPaperNode(paper('x'), { x: 0, y: 0 }), createPaperNode(paper('y', ['x']), { x: 0, y: 0 })];
    s = mindMapReducer(s, { type: 'LOAD_MAP', payload: { nodes, edges: [], layoutDirection: 'TB' } });
    expect(s.nodes.map((n) => n.id)).toEqual(['x', 'y']);
    expect(s.edges.map((e) => e.id)).toEqual(['cite-x-y']);
    expect(s.selectedNodeId).toBeNull();
    expect(s.layoutDirection).toBe('TB');
    expect(s.viewRequest).toEqual({ kind: 'layout', seq: 1 });
  });

  it('LOAD_MAP keeps the search panel open but closes the paper form', () => {
    let s = mindMapReducer(stateOf([paper('alpha')]), { type: 'SET_SIDEBAR_MODE', payload: 'search' });
    s = mindMapReducer(s, { type: 'LOAD_MAP', payload: { nodes: [], edges: [], layoutDirection: 'LR' } });
    expect(s.sidebarMode).toBe('search');
    s = mindMapReducer(s, { type: 'SET_SIDEBAR_MODE', payload: 'edit' });
    s = mindMapReducer(s, { type: 'LOAD_MAP', payload: { nodes: [], edges: [], layoutDirection: 'LR' } });
    expect(s.sidebarMode).toBe('closed');
  });

  it('initMindMapState only fits the view when nodes already have positions', () => {
    const s = initMindMapState({
      nodes: [createPaperNode(paper('a'), { x: 10, y: 0 })],
      edges: [],
      layoutDirection: 'LR',
    });
    expect(s.viewRequest.kind).toBe('fit');
  });
});

describe('ADD_LINKED_PAPERS', () => {
  const base = () => {
    const anchor = createPaperNode(paper('anchor'), { x: 1000, y: 500 });
    const known = createPaperNode(paper('known'), { x: 0, y: 0 });
    return initMindMapState({ nodes: [anchor, known], edges: [], layoutDirection: 'LR' });
  };

  it('adds references to the left and links them as cited by the anchor', () => {
    const s = mindMapReducer(base(), {
      type: 'ADD_LINKED_PAPERS',
      payload: { anchorId: 'anchor', kind: 'references', papers: [paper('r1'), paper('known')] },
    });
    expect(s.nodes.map((n) => n.id)).toEqual(['anchor', 'known', 'r1']);
    expect(refsOf(s, 'anchor')).toEqual(['r1', 'known']);
    expect(s.edges.map((e) => e.id).sort()).toEqual(['cite-known-anchor', 'cite-r1-anchor']);
    expect(s.nodes.find((n) => n.id === 'r1')!.position.x).toBeLessThan(1000);
  });

  it('adds citing papers to the right with a reference to the anchor', () => {
    const s = mindMapReducer(base(), {
      type: 'ADD_LINKED_PAPERS',
      payload: { anchorId: 'anchor', kind: 'citations', papers: [paper('c1'), paper('known')] },
    });
    expect(refsOf(s, 'c1')).toEqual(['anchor']);
    expect(refsOf(s, 'known')).toEqual(['anchor']);
    expect(s.nodes.find((n) => n.id === 'c1')!.position.x).toBeGreaterThan(1000);
  });

  it('connects related papers with a manual "related to" edge below', () => {
    const s = mindMapReducer(base(), {
      type: 'ADD_LINKED_PAPERS',
      payload: { anchorId: 'anchor', kind: 'related', papers: [paper('x1')] },
    });
    expect(s.edges.map((e) => e.id)).toEqual(['e-rel-anchor-x1']);
    expect(s.nodes.find((n) => n.id === 'x1')!.position.y).toBeGreaterThan(500);
  });
});

describe('paper identity across sources', () => {
  it('links an incoming paper to an existing node with the same arXiv id instead of duplicating', () => {
    const anchor = createPaperNode(paper('anchor'), { x: 0, y: 0 });
    const bert = createPaperNode({ ...paper('bert'), ids: { arxiv: '1810.04805' } }, { x: 0, y: 0 });
    let s = initMindMapState({ nodes: [anchor, bert], edges: [], layoutDirection: 'LR' });
    const fromOpenAlex = { ...paper('doi:10.48550/arxiv.1810.04805'), ids: { arxiv: '1810.04805', openalex: 'W1' } };
    s = mindMapReducer(s, { type: 'ADD_LINKED_PAPERS', payload: { anchorId: 'anchor', kind: 'citations', papers: [fromOpenAlex] } });
    expect(s.nodes.map((n) => n.id)).toEqual(['anchor', 'bert']);
    expect(refsOf(s, 'bert')).toEqual(['anchor']);
  });

  it('remaps imported graphs onto existing papers matched by title', () => {
    const mine = createPaperNode({ ...paper('my-uuid'), title: 'A Sufficiently Long Paper Title Here', notes: 'keep' }, { x: 0, y: 0 });
    let s = initMindMapState({ nodes: [mine], edges: [], layoutDirection: 'LR' });
    const incoming = createPaperNode({ ...paper('doi:10.1/x'), title: 'A sufficiently long paper title here', ids: { doi: '10.1/x' } }, { x: 0, y: 0 });
    s = mindMapReducer(s, {
      type: 'IMPORT_GRAPH',
      payload: { nodes: [incoming], edges: [{ id: 'grp-c-doi:10.1/x', source: 'c', target: 'doi:10.1/x' }] },
    });
    expect(s.nodes.filter(isPaperNode).map((n) => n.id)).toEqual(['my-uuid']);
    const p = s.nodes.filter(isPaperNode)[0].data.paper;
    expect(p.notes).toBe('keep');
    expect(p.ids?.doi).toBe('10.1/x');
  });
});

describe('ADD_PAPERS', () => {
  it('places new papers in a grid and refreshes ones already in the map', () => {
    const known = createPaperNode({ ...paper('known'), ids: { doi: '10.1234/k' }, notes: 'mine' }, { x: 7, y: 7 });
    let s = initMindMapState({ nodes: [known], edges: [], layoutDirection: 'LR' });
    s = mindMapReducer(s, {
      type: 'ADD_PAPERS',
      payload: {
        center: { x: 0, y: 0 },
        papers: [
          { ...paper('doi:10.1234/k'), ids: { doi: '10.1234/k' }, abstract: 'fresh' },
          paper('n1'),
          paper('n2'),
          paper('n1'),
        ],
      },
    });
    expect(s.nodes.map((n) => n.id)).toEqual(['known', 'n1', 'n2']);
    const k = s.nodes.filter(isPaperNode)[0];
    expect(k.position).toEqual({ x: 7, y: 7 });
    expect(k.data.paper).toMatchObject({ notes: 'mine', abstract: 'fresh' });
    const [n1, n2] = s.nodes.slice(1);
    expect(n1.position.y).toBe(n2.position.y);
    expect(n1.position.x).toBeLessThan(n2.position.x);
  });
});

describe('UPDATE_PAPER_META', () => {
  it('patches user fields without touching id, references or edges', () => {
    let s = stateOf([paper('alpha'), paper('beta', ['alpha'])]);
    const edges = s.edges;
    s = mindMapReducer(s, {
      type: 'UPDATE_PAPER_META',
      payload: { id: 'beta', patch: { status: 'read', tags: ['vr'], rating: 4, notes: 'good', id: 'x', references: [] } },
    });
    const beta = s.nodes.filter(isPaperNode).find((n) => n.id === 'beta')!.data.paper;
    expect(beta).toMatchObject({ id: 'beta', status: 'read', tags: ['vr'], rating: 4, notes: 'good', references: ['alpha'] });
    expect(s.edges).toBe(edges);
  });
});

describe('RENAME_CLUSTERS', () => {
  it('renames cluster nodes and ignores blank names and non-clusters', () => {
    const c = { id: 'c1', type: 'cluster' as const, position: { x: 0, y: 0 }, data: { label: 'Old', level: 'keyword', size: 1, color: '#000' } };
    let s = initMindMapState({ nodes: [c, createPaperNode(paper('alpha'), { x: 0, y: 0 })], edges: [], layoutDirection: 'LR' });
    s = mindMapReducer(s, { type: 'RENAME_CLUSTERS', payload: { c1: '  New name ', alpha: 'x', c2: 'y' } });
    expect(s.nodes[0].data).toMatchObject({ label: 'New name' });
    s = mindMapReducer(s, { type: 'RENAME_CLUSTERS', payload: { c1: '   ' } });
    expect(s.nodes[0].data).toMatchObject({ label: 'New name' });
  });
});

describe('comparison aspects', () => {
  it('sets, renames and fills aspects, keeping values with renamed columns', () => {
    let s = stateOf([paper('alpha'), paper('beta')]);
    s = mindMapReducer(s, { type: 'SET_ASPECTS', payload: [' Method ', 'Dataset', 'Method', ''] });
    expect(s.aspects).toEqual(['Method', 'Dataset']);
    s = mindMapReducer(s, { type: 'SET_ASPECT_VALUES', payload: { aspect: 'Method', values: { alpha: 'CNN', beta: 'RNN' } } });
    s = mindMapReducer(s, { type: 'RENAME_ASPECT', payload: { from: 'Method', to: '手法' } });
    expect(s.aspects).toEqual(['手法', 'Dataset']);
    const alpha = s.nodes.filter(isPaperNode)[0].data.paper;
    expect(alpha.comparison).toEqual({ 手法: 'CNN' });
    // Renaming onto an existing column is refused.
    expect(mindMapReducer(s, { type: 'RENAME_ASPECT', payload: { from: '手法', to: 'Dataset' } })).toBe(s);
  });

  it('loads aspects from a snapshot', () => {
    expect(initMindMapState({ nodes: [], edges: [], layoutDirection: 'LR', aspects: ['A'] }).aspects).toEqual(['A']);
  });
});

describe('search history', () => {
  const entry = (id: string, text: string, kind: 'query' | 'vague' = 'query') => ({ id, kind, text, at: '2026-01-01', resultCount: 1 });

  it('adds newest first, moves repeats to the top and keeps pins', () => {
    let s = stateOf([]);
    s = mindMapReducer(s, { type: 'ADD_HISTORY', payload: entry('1', 'vr') });
    s = mindMapReducer(s, { type: 'ADD_HISTORY', payload: entry('2', 'haptics') });
    s = mindMapReducer(s, { type: 'PIN_HISTORY', payload: '1' });
    s = mindMapReducer(s, { type: 'ADD_HISTORY', payload: entry('3', 'vr') });
    expect(s.history.map((h) => [h.id, h.text, !!h.pinned])).toEqual([
      ['3', 'vr', true],
      ['2', 'haptics', false],
    ]);
    s = mindMapReducer(s, { type: 'REMOVE_HISTORY', payload: '2' });
    expect(s.history.map((h) => h.id)).toEqual(['3']);
  });

  it('caps unpinned entries but never drops pinned ones', () => {
    let s = stateOf([]);
    s = mindMapReducer(s, { type: 'ADD_HISTORY', payload: entry('p', 'pinned') });
    s = mindMapReducer(s, { type: 'PIN_HISTORY', payload: 'p' });
    for (let i = 0; i < 60; i++) s = mindMapReducer(s, { type: 'ADD_HISTORY', payload: entry(`e${i}`, `q${i}`) });
    expect(s.history.length).toBeLessThanOrEqual(51);
    expect(s.history.some((h) => h.id === 'p')).toBe(true);
    expect(s.history[0].id).toBe('e59');
  });
});
