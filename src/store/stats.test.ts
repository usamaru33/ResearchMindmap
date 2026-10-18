import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { mapStats, median, venueName } from './stats';

const papers = [
  makePaper({ title: 'A', year: 2017, venue: 'NeurIPS', authors: ['Ashish Vaswani', 'Noam Shazeer'], citationCount: 100, pdfUrl: 'x', abstract: 'yes', tags: ['nlp'], publisher: 'ACM' }),
  makePaper({ title: 'B', year: 2017, venue: 'neurips', authors: ['Vaswani, A.'], citationCount: 10, status: 'read', tags: ['nlp', 'core'] }),
  makePaper({ title: 'C', year: 2019, venue: 'NeurIPS', authors: ['N. Shazeer'], status: 'reading', screening: { decision: 'include' } }),
  makePaper({ title: 'D', venue: 'ICLR', authors: [], citationCount: 4 }),
];

describe('mapStats', () => {
  it('summarizes a map', () => {
    const s = mapStats(papers);
    expect(s.total).toBe(4);
    expect(s.status).toEqual({ unread: 2, reading: 1, read: 1, skipped: 0 });
    expect(s.screening).toEqual({ include: 1, maybe: 0, exclude: 0, pending: 3 });
    expect([s.openAccess, s.withAbstract]).toEqual([1, 1]);
    expect(s.citations).toEqual({ median: 10, max: 100, known: 3 });
    expect(s.byYear).toEqual([
      { year: 2017, count: 2 },
      { year: 2019, count: 1 },
    ]);
    expect(s.undated).toBe(1);
    expect(s.venues).toEqual([
      { label: 'NeurIPS', count: 3 },
      { label: 'ICLR', count: 1 },
    ]);
    expect(s.authors).toEqual([
      { label: 'Ashish Vaswani', count: 2 },
      { label: 'Noam Shazeer', count: 2 },
    ]);
    expect(s.tags).toEqual([
      { label: 'nlp', count: 2 },
      { label: 'core', count: 1 },
    ]);
    expect(s.topCited.map((p) => p.title)).toEqual(['A', 'B', 'D']);
  });

  it('takes medians', () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(3);
  });
});

describe('venueName', () => {
  it.each([
    ['NeurIPS 2017', 'NeurIPS'],
    ["CHI '20", 'CHI'],
    ['ICML (2019)', 'ICML'],
    ['Nature', 'Nature'],
    ['2020', '2020'],
  ])('%s → %s', (raw, name) => expect(venueName(raw)).toBe(name));
});
