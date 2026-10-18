import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import type { HistoryEntry } from '../types';
import { SEEN_LIMIT, alertQuery, dueForCheck, mergeSeen, seenKeys, unseenPapers, watchedEntries } from './alerts';

const a = makePaper({ title: 'Paper A about things', year: 2025, ids: { doi: '10.1/A' } });
const b = makePaper({ title: 'Paper B about other things', year: 2026, ids: { openalex: 'W2' } });
const entry = (patch: Partial<HistoryEntry>): HistoryEntry => ({ id: 'h', kind: 'query', text: 'q', at: '2026-01-01T00:00:00Z', resultCount: 0, ...patch });

describe('alerts', () => {
  it('finds papers not seen before, matching by id or DOI', () => {
    const seen = seenKeys([a]);
    expect(unseenPapers([a, b], seen)).toEqual([b]);
    // Same DOI under a different id is still "seen".
    const again = { ...makePaper({ title: 'Paper A (preprint)', year: 2025, ids: { doi: '10.1/a' } }), id: 'other' };
    expect(unseenPapers([again], seen)).toEqual([]);
    expect(unseenPapers([a], undefined)).toEqual([a]);
  });

  it('merges seen keys newest first, capped', () => {
    expect(mergeSeen(['x', 'y'], ['z', 'x'])).toEqual(['z', 'x', 'y']);
    const many = Array.from({ length: SEEN_LIMIT + 10 }, (_, i) => `k${i}`);
    expect(mergeSeen(['old'], many)).toHaveLength(SEEN_LIMIT);
  });

  it('limits the alert query to recent years', () => {
    const now = new Date('2026-10-18T00:00:00Z');
    expect(alertQuery('"body ownership" AND VR', now)).toBe('"body ownership" AND VR year:>=2025');
    expect(alertQuery('robot OR drone', now)).toBe('(robot OR drone) year:>=2025');
  });

  it('watches pinned query searches and throttles automatic checks', () => {
    const history = [entry({ id: '1', pinned: true }), entry({ id: '2' }), entry({ id: '3', pinned: true, kind: 'vague' })];
    expect(watchedEntries(history).map((h) => h.id)).toEqual(['1']);
    const now = new Date('2026-10-18T12:00:00Z');
    expect(dueForCheck(entry({}), now)).toBe(true);
    expect(dueForCheck(entry({ checkedAt: '2026-10-18T01:00:00Z' }), now)).toBe(false);
    expect(dueForCheck(entry({ checkedAt: '2026-10-17T11:00:00Z' }), now)).toBe(true);
  });
});
