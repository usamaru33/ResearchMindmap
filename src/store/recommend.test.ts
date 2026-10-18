import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { makeTranslate } from '../i18n';
import { pickSeeds, reasonText } from './recommend';

describe('pickSeeds', () => {
  it('keeps locatable papers, preferring rated, read and cited ones', () => {
    const papers = [
      makePaper({ title: 'No ids', year: 2020 }),
      makePaper({ title: 'Cited', year: 2020, ids: { doi: '10.1/a' }, citationCount: 5000 }),
      makePaper({ title: 'Rated', year: 2020, ids: { openalex: 'W1' }, rating: 4 }),
      makePaper({ title: 'Read', year: 2020, ids: { arxiv: '1706.03762' }, status: 'read' }),
    ];
    expect(pickSeeds(papers, 10).map((p) => p.title)).toEqual(['Rated', 'Read', 'Cited']);
    expect(pickSeeds(papers, 1)).toHaveLength(1);
  });
});

describe('reasonText', () => {
  it('lists only the links that exist, in the UI language', () => {
    expect(reasonText({ cocited: 3, citing: 0, related: 2 }, makeTranslate('en'))).toBe('cited by 3 seed papers · related to 2 seed papers');
    expect(reasonText({ cocited: 0, citing: 2, related: 0 }, makeTranslate('ja'))).toBe('もとの論文 2 件を引用');
  });
});
