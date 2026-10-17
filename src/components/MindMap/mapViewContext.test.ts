import { describe, expect, it } from 'vitest';
import { makePaper } from '../../../shared/paper';
import { accentColor, citationScale } from './mapViewContext';

describe('map view helpers', () => {
  const p = makePaper({ title: 't', year: 2020, status: 'read', sources: ['arxiv'] });

  it('picks an accent per color mode', () => {
    expect(accentColor('cluster', p, '#123456')).toBe('#123456');
    expect(accentColor('status', p, undefined)).toBe('#10b981');
    expect(accentColor('source', p, undefined)).toBe('#b91c1c');
    expect(accentColor('year', p, undefined)).toBeUndefined();
  });

  it('scales cards logarithmically by citations', () => {
    expect(citationScale(undefined, 1000)).toBe(0.85);
    expect(citationScale(1000, 1000)).toBeCloseTo(1.35);
    const mid = citationScale(30, 1000);
    expect(mid).toBeGreaterThan(0.85);
    expect(mid).toBeLessThan(1.35);
  });
});
