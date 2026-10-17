import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { createPaperNode } from '../store/mindMapReducer';
import { paperRoles } from '../store/keyPapers';
import type { MapNode } from '../types';
import { YEAR_WIDTH, timelineLayout } from './timelineLayout';

const node = (id: string, year: number, refs: string[] = [], cites = 0) =>
  createPaperNode(makePaper({ id, title: id, year, references: refs, citationCount: cites }), { x: 0, y: 0 });

describe('timelineLayout', () => {
  it('puts each year in its own column, collapsing empty years, undated last', () => {
    const cluster: MapNode = { id: 'c', type: 'cluster', position: { x: 0, y: 0 }, data: { label: 'C', level: 'x', size: 1, color: '#000' } };
    const out = timelineLayout([node('a', 2020), node('b', 2016, [], 5), node('c2', 2016, [], 50), node('d', 0), cluster]);
    expect(out.columns).toEqual([
      { year: 2016, x: 0 },
      { year: 2020, x: YEAR_WIDTH },
      { year: 0, x: YEAR_WIDTH * 2 },
    ]);
    const pos = Object.fromEntries(out.nodes.map((n) => [n.id, n.position]));
    // More cited first within a year.
    expect(pos.c2.y).toBeLessThan(pos.b.y);
    expect(pos.a.x).toBe(YEAR_WIDTH);
    expect(pos.c.x).toBeLessThan(0);
  });
});

describe('paperRoles', () => {
  it('marks heavily cited papers as foundations and new building papers as recent', () => {
    const papers = [
      node('old', 2010),
      node('mid', 2015, ['old']),
      node('x', 2018, ['old', 'mid']),
      node('new1', 2023, ['x']),
      node('new2', 2024, []),
    ].map((n) => (n.type === 'paper' ? n.data.paper : null)!);
    const roles = paperRoles(papers);
    expect(roles.get('old')).toBe('foundation');
    expect(roles.get('new1')).toBe('recent');
    expect(roles.has('new2')).toBe(false);
    expect(roles.has('mid')).toBe(false);
  });
});
