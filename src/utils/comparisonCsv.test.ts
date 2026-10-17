import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { comparisonCsv } from './comparisonCsv';

describe('comparisonCsv', () => {
  it('writes one column per aspect in order', () => {
    const p = makePaper({ title: 'T, with comma', year: 2020, authors: ['A', 'B'], comparison: { 手法: 'CNN', 結果: 'good "really"' } });
    const lines = comparisonCsv([p], ['手法', '結果', 'データ']).slice(1).split('\r\n');
    expect(lines[0]).toBe('title,year,authors,venue,doi,手法,結果,データ');
    expect(lines[1]).toBe('"T, with comma",2020,A; B,,,CNN,"good ""really""",');
  });
});
