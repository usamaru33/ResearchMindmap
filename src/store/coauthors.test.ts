import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { forceLayout } from '../utils/forceLayout';
import { researchFlow } from '../utils/researchFlow';
import { authorKey, coauthorGraph, topCoauthors } from './coauthors';

const paper = (title: string, authors: string[], year = 2020, topics: string[] = []) =>
  makePaper({ title, authors, year, topics: topics.map((name, i) => ({ id: `T${name}${i}`, name, level: 'topic' as const })) });

describe('authorKey', () => {
  it('matches the same person written differently', () => {
    expect(authorKey('Vaswani, A.')).toBe(authorKey('Ashish Vaswani'));
    expect(authorKey('Léon Bottou')).toBe(authorKey('Leon Bottou'));
    expect(authorKey('Ludwig van Beethoven')).toBe('van beethoven l');
    expect(authorKey('  ')).toBe('');
    expect(authorKey('et al.')).toBe('');
    expect(authorKey('others')).toBe('');
  });
});

describe('coauthorGraph', () => {
  const papers = [
    paper('a', ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar']),
    paper('b', ['Vaswani, A.', 'Shazeer, N.']),
    paper('c', ['Yann LeCun', 'Léon Bottou']),
    paper('big', Array.from({ length: 40 }, (_, i) => `Person ${i}`)),
  ];

  it('merges spellings, counts papers and weights edges', () => {
    const g = coauthorGraph(papers);
    const vaswani = g.authors.find((a) => a.key === 'vaswani a')!;
    expect(vaswani.name).toBe('Ashish Vaswani');
    expect(vaswani.paperIds).toHaveLength(2);
    expect(g.edges[0]).toEqual({ a: 'shazeer n', b: 'vaswani a', weight: 2 });
    expect(g.authors.some((a) => a.name.startsWith('Person'))).toBe(false);
  });

  it('keeps only the top authors and the edges among them', () => {
    const g = coauthorGraph(papers, 2);
    expect(g.authors.map((a) => a.key).sort()).toEqual(['shazeer n', 'vaswani a']);
    expect(g.edges).toHaveLength(1);
  });

  it('lists frequent co-authors of one person', () => {
    expect(topCoauthors(papers, 'A. Vaswani')).toEqual([
      { name: 'Noam Shazeer', count: 2 },
      { name: 'Niki Parmar', count: 1 },
    ]);
  });
});

describe('forceLayout', () => {
  it('is deterministic, stays in the box and pulls linked nodes together', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const edges = [
      { a: 'a', b: 'b', weight: 5 },
      { a: 'c', b: 'd' },
      { a: 'd', b: 'e' },
    ];
    const one = forceLayout(ids, edges, { width: 400, height: 300 });
    const two = forceLayout(ids, edges, { width: 400, height: 300 });
    expect([...one]).toEqual([...two]);
    for (const p of one.values()) {
      expect(p.x).toBeGreaterThanOrEqual(29.99);
      expect(p.x).toBeLessThanOrEqual(370.01);
      expect(p.y).toBeGreaterThanOrEqual(29.99);
      expect(p.y).toBeLessThanOrEqual(270.01);
    }
    const dist = (x: string, y: string) => Math.hypot(one.get(x)!.x - one.get(y)!.x, one.get(x)!.y - one.get(y)!.y);
    expect(dist('a', 'b')).toBeLessThan(dist('a', 'f'));
  });

  it('centres a single node', () => {
    expect(forceLayout(['x'], [], { width: 100, height: 50 }).get('x')).toEqual({ x: 50, y: 25 });
  });
});

describe('researchFlow', () => {
  it('splits by year into periods and lists leading topics', () => {
    const papers = [
      paper('1', [], 2001, ['CNN']),
      paper('2', [], 2002, ['CNN']),
      paper('3', [], 2002, ['SVM']),
      paper('4', [], 2010, ['Deep learning']),
      paper('5', [], 2012, ['Deep learning', 'CNN']),
      paper('6', [], 0, ['ignored']),
    ];
    const flow = researchFlow(papers, 2);
    expect(flow.map((f) => [f.from, f.to, f.count])).toEqual([
      [2001, 2002, 3],
      [2010, 2012, 2],
    ]);
    expect(flow[0].topics[0]).toEqual({ name: 'CNN', count: 2 });
    expect(flow[1].topics[0]).toEqual({ name: 'Deep learning', count: 2 });
  });

  it('does not split one year across periods', () => {
    const papers = [paper('1', [], 2020), paper('2', [], 2020), paper('3', [], 2020)];
    expect(researchFlow(papers, 4)).toHaveLength(1);
    expect(researchFlow([], 4)).toEqual([]);
  });
});
