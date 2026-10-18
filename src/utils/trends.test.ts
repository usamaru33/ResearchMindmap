import { describe, expect, it } from 'vitest';
import type { TrendsResponse } from '../../shared/types';
import { formatValue, niceMax, trendValues, trendsCsv } from './trends';

const r: TrendsResponse = {
  yearMin: 2021,
  yearMax: 2022,
  series: [
    { query: 'drone', byYear: [{ year: 2021, count: 3 }, { year: 2022, count: 6 }], total: 9, approximate: false },
    { query: 'a, "b"', byYear: [{ year: 2021, count: 1 }, { year: 2022, count: 0 }], total: 1, approximate: true },
    { query: 'bad (', byYear: [], total: 0, approximate: false, error: 'invalid_query' },
  ],
  all: [{ year: 2021, count: 1000 }, { year: 2022, count: 2000 }],
};

describe('trends', () => {
  it('turns counts into shares of all works', () => {
    expect(trendValues(r, 'count')[0]).toEqual([3, 6]);
    expect(trendValues(r, 'share')[0]).toEqual([3, 3]);
  });

  it('rounds axis maxima', () => {
    expect([niceMax(0), niceMax(7), niceMax(13), niceMax(240), niceMax(5000)]).toEqual([1, 10, 20, 250, 5000]);
  });

  it('formats values', () => {
    expect(formatValue(25300, 'count')).toBe('25k');
    expect(formatValue(0.123, 'share')).toBe('0.12');
    expect(formatValue(0, 'share')).toBe('0');
  });

  it('writes CSV without failed series', () => {
    expect(trendsCsv(r)).toBe('year,drone,"a, ""b""",all works\n2021,3,1,1000\n2022,6,0,2000\n');
  });
});
