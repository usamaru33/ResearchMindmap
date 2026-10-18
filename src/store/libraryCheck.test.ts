import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { isPaperNode, type MindMapState, type Paper } from '../types';
import { buildCitationEdges, createPaperNode, createStyledEdge, mindMapReducer } from './mindMapReducer';
import { findDuplicates, isPreprint, mergePaperRecords, missingFields, publishedPatch } from './libraryCheck';

const preprint = makePaper({ id: 'arxiv:1706.03762', title: 'Attention Is All You Need', year: 2017, authors: ['Ashish Vaswani'], venue: 'arXiv', ids: { arxiv: '1706.03762' }, type: 'preprint' });
const published = makePaper({ id: 'doi:10.5555/nips', title: 'Attention is all you need', year: 2017, authors: ['Ashish Vaswani'], venue: 'NeurIPS', ids: { doi: '10.5555/nips', openalex: 'W1' }, type: 'proceedings-article', citationCount: 9000 });
const other = makePaper({ id: 'doi:10.1/x', title: 'Something else entirely', year: 2017, ids: { doi: '10.1/x' } });

describe('library checks', () => {
  it('groups records of the same work', () => {
    const sameDoi = makePaper({ id: 'local-1', title: 'Other title', year: 2019, ids: { doi: '10.1/X' } });
    const groups = findDuplicates([preprint, other, published, sameDoi]);
    expect(groups.map((g) => g.map((p) => p.id))).toEqual([
      ['arxiv:1706.03762', 'doi:10.5555/nips'],
      ['doi:10.1/x', 'local-1'],
    ]);
    // Same title, years far apart: different works.
    const later = { ...published, id: 'later', ids: {}, year: 2023 };
    expect(findDuplicates([preprint, later])).toEqual([]);
  });

  it('lists missing fields and spots preprints', () => {
    expect(missingFields(other)).toEqual(['authors', 'venue', 'abstract']);
    expect(missingFields(preprint)).toEqual(['abstract']);
    expect(missingFields(makePaper({ title: 'x' }))).toEqual(['year', 'authors', 'venue', 'abstract', 'doi']);
    expect(isPreprint(preprint)).toBe(true);
    expect(isPreprint({ ...preprint, type: undefined, venue: '', ids: { arxiv: '1706.03762', doi: '10.48550/arxiv.1706.03762' } })).toBe(true);
    expect(isPreprint(published)).toBe(false);
  });

  it('replaces a preprint with its published version, keeping user data', () => {
    const mine: Paper = { ...preprint, notes: 'key paper', tags: ['core'], rating: 5, pdfUrl: 'https://arxiv.org/pdf/1706.03762' };
    const patched = { ...mine, ...publishedPatch(mine, published) };
    expect(patched).toMatchObject({
      id: 'arxiv:1706.03762',
      venue: 'NeurIPS',
      type: 'proceedings-article',
      notes: 'key paper',
      tags: ['core'],
      rating: 5,
      pdfUrl: 'https://arxiv.org/pdf/1706.03762',
      citationCount: 9000,
      ids: { arxiv: '1706.03762', doi: '10.5555/nips', openalex: 'W1' },
    });
  });

  it('merges records: the kept one wins, gaps are filled, user data is combined', () => {
    const keep: Paper = { ...published, tags: ['a'], notes: 'n1', status: 'reading', comparison: { Method: 'X' } };
    const dup: Paper = { ...preprint, abstract: 'From arXiv', tags: ['b', 'a'], notes: 'n2', rating: 4, status: 'read', comparison: { Method: 'Y', Data: 'D' } };
    const merged = mergePaperRecords(keep, [dup]);
    expect(merged).toMatchObject({
      id: published.id,
      venue: 'NeurIPS',
      abstract: 'From arXiv',
      tags: ['a', 'b'],
      notes: 'n1\n\nn2',
      rating: 4,
      status: 'read',
      comparison: { Method: 'X', Data: 'D' },
      ids: { doi: '10.5555/nips', openalex: 'W1', arxiv: '1706.03762' },
    });
  });
});

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

describe('MERGE_PAPERS', () => {
  it('rewires citations and edges onto the kept paper', () => {
    const a = { ...preprint, references: [other.id] };
    const b = { ...published, references: [] };
    const citer = makePaper({ id: 'citer', title: 'A later paper citing both', year: 2020, references: [a.id, b.id] });
    const citedByBoth = { ...other, references: [] };
    let s = stateOf([a, b, citer, citedByBoth]);
    s = {
      ...s,
      edges: [...s.edges, createStyledEdge('e-1', 'citer', a.id, 'extends'), createStyledEdge('e-2', a.id, b.id, 'same work')],
      selectedNodeId: a.id,
    };
    const next = mindMapReducer(s, { type: 'MERGE_PAPERS', payload: { keepId: b.id, mergeIds: [a.id] } });
    const papers = next.nodes.filter(isPaperNode).map((n) => n.data.paper);
    expect(papers.map((p) => p.id)).toEqual([b.id, 'citer', other.id]);
    expect(papers.find((p) => p.id === 'citer')?.references).toEqual([b.id]);
    expect(papers.find((p) => p.id === b.id)?.references).toEqual([other.id]);
    expect(papers.find((p) => p.id === b.id)?.ids?.arxiv).toBe('1706.03762');
    const manual = next.edges.filter((e) => !e.id.startsWith('cite-')).map((e) => `${e.id}:${e.source}>${e.target}`);
    // The edge between the two records became a self-loop and is dropped.
    expect(manual).toEqual([`e-1:citer>${b.id}`]);
    expect(next.edges.filter((e) => e.id.startsWith('cite-')).map((e) => e.id).sort()).toEqual([`cite-${other.id}-${b.id}`, `cite-${b.id}-citer`]);
    expect(next.selectedNodeId).toBe(b.id);
  });

  it('ignores a merge without other papers', () => {
    const s = stateOf([preprint]);
    expect(mindMapReducer(s, { type: 'MERGE_PAPERS', payload: { keepId: preprint.id, mergeIds: [preprint.id] } })).toBe(s);
  });
});
