import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { EMPTY_FILTERS, filterPapers, sortPapers } from './library';

const papers = [
  makePaper({ id: 'a', title: 'Attention Is All You Need', year: 2017, authors: ['Vaswani'], citationCount: 100, status: 'read', tags: ['nlp'], rating: 5 }),
  makePaper({ id: 'b', title: 'Deep Residual Learning', year: 2016, authors: ['He'], citationCount: 300, tags: ['vision'], notes: 'skip connections' }),
  makePaper({ id: 'c', title: 'Vision Transformer', year: 2021, authors: ['Dosovitskiy'], status: 'reading', tags: ['vision', 'nlp'] }),
];

describe('filterPapers', () => {
  it('matches every word across fields, ignoring case and accents', () => {
    expect(filterPapers(papers, { ...EMPTY_FILTERS, text: 'vision dosovitskiy' }).map((p) => p.id)).toEqual(['c']);
    expect(filterPapers(papers, { ...EMPTY_FILTERS, text: 'SKIP' }).map((p) => p.id)).toEqual(['b']);
  });

  it('filters by status (unset counts as unread) and tag', () => {
    expect(filterPapers(papers, { ...EMPTY_FILTERS, status: 'unread' }).map((p) => p.id)).toEqual(['b']);
    expect(filterPapers(papers, { ...EMPTY_FILTERS, tag: 'nlp' }).map((p) => p.id)).toEqual(['a', 'c']);
  });
});

describe('sortPapers', () => {
  it('sorts by the chosen column in either direction', () => {
    expect(sortPapers(papers, 'year', 'desc').map((p) => p.id)).toEqual(['c', 'a', 'b']);
    expect(sortPapers(papers, 'citations', 'desc').map((p) => p.id)).toEqual(['b', 'a', 'c']);
    expect(sortPapers(papers, 'status', 'asc').map((p) => p.id)).toEqual(['c', 'b', 'a']);
    expect(sortPapers(papers, 'title', 'asc').map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});
