import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import type { MissingCandidate, Paper } from '../../shared/types';
import { coveragePercent, linksFor, missingSeeds, signalsOf, visibleCandidates } from './missing';

const cand = (id: string, extra: Partial<MissingCandidate> = {}, paper: Partial<Paper> = {}): MissingCandidate => ({
  paper: makePaper({ id: `openalex:${id}`, title: `Paper ${id} about something long enough`, ids: { openalex: id }, ...paper }),
  citedBy: [],
  cites: [],
  cocited: 0,
  score: 1,
  ...extra,
});

describe('missing papers (client side)', () => {
  it('sends only papers OpenAlex can find, most cited first', () => {
    const papers = [
      makePaper({ id: 'a', title: 'A', citationCount: 5, ids: { doi: '10.1234/a' } }),
      makePaper({ id: 'b', title: 'B' }),
      makePaper({ id: 'c', title: 'C', citationCount: 50, ids: { arxiv: '1706.03762' } }),
    ];
    expect(missingSeeds(papers).map((s) => s.id)).toEqual(['c', 'a']);
  });

  it('names the clues of each candidate', () => {
    expect(signalsOf(cand('W1', { citedBy: ['a', 'b'], cocited: 5 }))).toEqual(['foundation', 'cocited']);
    expect(signalsOf(cand('W2', { cites: ['a', 'b', 'c'] }))).toEqual(['followUp']);
  });

  it('hides candidates already in the map under another id, and filters by clue', () => {
    const inMap = makePaper({ id: 'mine', title: 'Mine', ids: { doi: '10.1234/same' } });
    const dup = cand('W3', { citedBy: ['a', 'b'] }, { ids: { openalex: 'W3', doi: '10.1234/same' } });
    const fresh = cand('W4', { cites: ['a', 'b'] });
    expect(visibleCandidates([dup, fresh], [inMap]).map((c) => c.paper.id)).toEqual(['openalex:W4']);
    expect(visibleCandidates([dup, fresh], [], 'foundation').map((c) => c.paper.id)).toEqual(['openalex:W3']);
  });

  it('turns the evidence into citations to draw', () => {
    expect(linksFor([cand('W5', { citedBy: ['a', 'b'], cites: ['c'] })])).toEqual([
      ['a', 'openalex:W5'],
      ['b', 'openalex:W5'],
      ['openalex:W5', 'c'],
    ]);
  });

  it('reports coverage as a percentage', () => {
    expect(coveragePercent({ total: 25, inMap: 17 })).toBe(68);
    expect(coveragePercent({ total: 0, inMap: 0 })).toBeNull();
  });
});
