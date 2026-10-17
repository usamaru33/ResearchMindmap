import { describe, expect, it } from 'vitest';
import type { MapNode, PaperEdge } from '../types';
import { clusterGroups } from './groups';

const cluster = (id: string, label: string): MapNode => ({
  id,
  type: 'cluster',
  position: { x: 0, y: 0 },
  data: { label, level: 'keyword', size: 0, color: '#000' },
});
const grp = (c: string, p: string): PaperEdge => ({ id: `grp-${c}-${p}`, source: c, target: p });

describe('clusterGroups', () => {
  it('turns cluster nodes and membership edges into ordered groups, Other last', () => {
    const nodes = [cluster('c0', 'Other'), cluster('c1', 'Haptics'), cluster('c2', 'Empty')];
    const edges = [grp('c0', 'x'), grp('c1', 'a'), grp('c1', 'b'), { id: 'cite-a-b', source: 'a', target: 'b' }];
    expect(clusterGroups(nodes, edges)).toEqual([
      { label: 'Haptics', paperIds: ['a', 'b'] },
      { label: 'Other', paperIds: ['x'] },
    ]);
  });
});
