import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import type { GraphBuildResponse, Paper } from '../../shared/types';
import { isPaperNode, type MapNode, type MindMapState } from '../types';
import { getLayoutedElements } from '../utils/layout';
import { mindMapLayout } from '../utils/mindMapLayout';
import { buildGraphElements } from './graphImport';
import { createPaperNode, initMindMapState, mindMapReducer } from './mindMapReducer';

const paper = (id: string, extra: Partial<Paper> = {}) => makePaper({ id, title: `Paper ${id}`, year: 2020, ...extra });

function graph(): GraphBuildResponse {
  return {
    papers: [paper('a'), paper('b', { references: ['a'] }), paper('c'), paper('d')],
    citationLinks: [{ source: 'a', target: 'b' }],
    clusters: [
      { id: 'topic:T1', label: 'Embodiment', level: 'topic', paperIds: ['a', 'b', 'c'] },
      { id: 'other', label: 'Other', level: 'topic', paperIds: ['d'] },
    ],
    enriched: 0,
    warnings: [],
  };
}

describe('buildGraphElements', () => {
  it('creates a query root, clusters and papers with structural edges', () => {
    const { nodes, edges } = buildGraphElements(graph(), { query: 'embodiment vr', mode: 'query', now: '2026-01-01T00:00:00Z' });
    expect(nodes.map((n) => n.type)).toEqual(['query', 'cluster', 'cluster', 'paper', 'paper', 'paper', 'paper']);
    const root = nodes[0];
    expect(root.data).toMatchObject({ query: 'embodiment vr', paperCount: 4 });
    expect(edges.filter((e) => e.id.startsWith('root-'))).toHaveLength(2);
    expect(edges.filter((e) => e.id.startsWith('grp-'))).toHaveLength(4);
    expect(edges.every((e) => !e.id.startsWith('cite-'))).toBe(true);
    const a = nodes.find((n) => n.id === 'a');
    expect(a && isPaperNode(a) && a.data.accent).toBe('#6366f1');
    const d = nodes.find((n) => n.id === 'd');
    expect(d && isPaperNode(d) && d.data.accent).toBe('#94a3b8');
  });
});

describe('IMPORT_GRAPH', () => {
  it('adds the graph, derives citation edges and requests a layout', () => {
    let s = initMindMapState({ nodes: [], edges: [], layoutDirection: 'LR' });
    const { nodes, edges } = buildGraphElements(graph(), { query: 'q', mode: 'query' });
    s = mindMapReducer(s, { type: 'IMPORT_GRAPH', payload: { nodes, edges } });
    expect(s.nodes).toHaveLength(7);
    expect(s.edges.filter((e) => e.id.startsWith('cite-')).map((e) => e.id)).toEqual(['cite-a-b']);
    expect(s.edges.filter((e) => e.id.startsWith('grp-'))).toHaveLength(4);
    expect(s.viewRequest.kind).toBe('layout');
  });

  it('merges into existing papers without losing user edits', () => {
    const existing = createPaperNode(paper('a', { notes: 'my notes', status: 'read', references: ['z'], abstract: '' }), { x: 5, y: 5 });
    let s: MindMapState = initMindMapState({ nodes: [existing, createPaperNode(paper('z'), { x: 0, y: 0 })], edges: [], layoutDirection: 'LR' });
    const g = graph();
    g.papers[0] = paper('a', { abstract: 'fresh abstract', citationCount: 9 });
    const { nodes, edges } = buildGraphElements(g, { query: 'q', mode: 'query' });
    s = mindMapReducer(s, { type: 'IMPORT_GRAPH', payload: { nodes, edges } });
    const a = s.nodes.filter(isPaperNode).find((n) => n.id === 'a')!;
    expect(a.data.paper).toMatchObject({ notes: 'my notes', status: 'read', abstract: 'fresh abstract', citationCount: 9 });
    expect(a.data.paper.references).toEqual(['z']);
    expect(s.nodes.filter((n) => n.id === 'a')).toHaveLength(1);
  });
});

describe('mind map layout', () => {
  const elements = () => {
    const g = graph();
    // Make one big cluster so both sides are used.
    g.papers.push(...Array.from({ length: 10 }, (_, i) => paper(`x${i}`)));
    g.clusters.push({ id: 'topic:T2', label: 'Haptics', level: 'topic', paperIds: g.papers.slice(4).map((p) => p.id) });
    return buildGraphElements(g, { query: 'q', mode: 'query' });
  };

  it('places every tree node and balances clusters across both sides', () => {
    const { nodes, edges } = elements();
    const out = mindMapLayout(nodes, edges);
    expect(out.placed.size).toBe(nodes.length);
    const clusters = out.nodes.filter((n) => n.type === 'cluster');
    const sides = clusters.map((c) => (c.data as { side?: string }).side);
    expect(sides).toContain('left');
    expect(sides).toContain('right');
  });

  it('puts papers outward of their cluster and routes root edges by side', () => {
    const { nodes, edges } = elements();
    const out = mindMapLayout(nodes, edges);
    const pos = new Map(out.nodes.map((n) => [n.id, n]));
    for (const e of out.edges.filter((x) => x.id.startsWith('grp-'))) {
      const cluster = pos.get(e.source)!;
      const p = pos.get(e.target)!;
      const side = (cluster.data as { side?: string }).side;
      if (side === 'right') expect(p.position.x).toBeGreaterThan(cluster.position.x);
      else expect(p.position.x).toBeLessThan(cluster.position.x);
    }
    for (const e of out.edges.filter((x) => x.id.startsWith('root-'))) {
      const side = (pos.get(e.target)!.data as { side?: string }).side;
      expect(e.sourceHandle).toBe(side === 'left' ? 'l' : 'r');
    }
  });

  it('lays out hand-added papers below the tree', () => {
    const { nodes, edges } = elements();
    const loose: MapNode = createPaperNode(paper('manual'), { x: 0, y: 0 });
    const out = getLayoutedElements([...nodes, loose], edges, 'LR');
    const treeBottom = Math.max(...out.nodes.filter((n) => n.id !== 'manual').map((n) => n.position.y));
    expect(out.nodes.find((n) => n.id === 'manual')!.position.y).toBeGreaterThan(treeBottom);
  });
});
