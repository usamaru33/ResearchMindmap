import { describe, expect, it } from 'vitest';
import { parseQuery } from '../../../shared/query';
import { EMPTY_CHIPS, chipsToQuery, combineQuery } from './searchFilters';

describe('search filter chips', () => {
  it('renders chips as RQL filters', () => {
    expect(chipsToQuery(EMPTY_CHIPS)).toBe('');
    expect(chipsToQuery({ yearFrom: '2019', yearTo: '2024', publishers: ['acm', 'ieee'], openAccess: true })).toBe(
      'year:2019..2024 publisher:(acm OR ieee) oa:true',
    );
    expect(chipsToQuery({ ...EMPTY_CHIPS, yearTo: '2010' })).toBe('year:<=2010');
  });

  it('groups a top-level OR so filters apply to the whole query', () => {
    const combined = combineQuery('vr OR ar', { ...EMPTY_CHIPS, publishers: ['acm'] });
    expect(combined).toBe('(vr OR ar) publisher:acm');
    const parsed = parseQuery(combined);
    expect(parsed.ok && parsed.query.filters.publishers).toEqual(['acm']);
  });

  it('keeps the typed query untouched without chips', () => {
    expect(combineQuery('  haptics  ', EMPTY_CHIPS)).toBe('haptics');
  });
});
