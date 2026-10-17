import { describe, expect, it } from 'vitest';
import type { Paper } from '../types';
import { collectTerms, matchesQuery, parseQuery, stem } from './index';

function paper(p: Partial<Paper>): Paper {
  return {
    id: 'p',
    title: '',
    authors: [],
    belongs: '',
    year: 2020,
    venue: '',
    abstract: '',
    challenges: '',
    futureWork: '',
    references: [],
    ...p,
  };
}

function matches(query: string, p: Partial<Paper>): boolean {
  const r = parseQuery(query);
  if (!r.ok) throw new Error(r.errors[0].message);
  return matchesQuery(r.query, paper(p));
}

const vrPaper: Partial<Paper> = {
  title: 'Body Ownership Illusions in Virtual Reality',
  abstract: 'We study how avatars change perceived object sizes.',
  authors: ['Smith, J.', 'Tanaka, K.'],
  venue: 'IEEE VR',
  year: 2019,
  keywords: ['embodiment'],
  ids: { doi: '10.1109/vr.2019.123' },
};

describe('matchesQuery', () => {
  it('matches words with simple stemming', () => {
    expect(matches('illusion avatar', vrPaper)).toBe(true);
    expect(matches('illusions avatars', vrPaper)).toBe(true);
    expect(matches('haptics', vrPaper)).toBe(false);
  });

  it('matches phrases only when adjacent', () => {
    expect(matches('"virtual reality"', vrPaper)).toBe(true);
    expect(matches('"reality virtual"', vrPaper)).toBe(false);
  });

  it('respects fields', () => {
    expect(matches('title:ownership', vrPaper)).toBe(true);
    expect(matches('abstract:ownership', vrPaper)).toBe(false);
    expect(matches('author:tanaka', vrPaper)).toBe(true);
    expect(matches('keyword:embodiment', vrPaper)).toBe(true);
    expect(matches('venue:vr', vrPaper)).toBe(true);
    expect(matches('tiab:embodiment', vrPaper)).toBe(true);
  });

  it('handles boolean logic and wildcards', () => {
    expect(matches('(haptics OR avatar) AND NOT survey', vrPaper)).toBe(true);
    expect(matches('avatar NOT illusion', vrPaper)).toBe(false);
    expect(matches('virt*', vrPaper)).toBe(true);
    expect(matches('"virtual real*"', vrPaper)).toBe(true);
  });

  it('applies filters', () => {
    expect(matches('avatar year:2019', vrPaper)).toBe(true);
    expect(matches('avatar year:>=2020', vrPaper)).toBe(false);
    expect(matches('avatar publisher:ieee', vrPaper)).toBe(true);
    expect(matches('avatar publisher:acm', vrPaper)).toBe(false);
    expect(matches('avatar oa:true', vrPaper)).toBe(false);
    expect(matches('avatar oa:true', { ...vrPaper, pdfUrl: 'https://x/pdf' })).toBe(true);
  });

  it('ignores accents and case', () => {
    expect(matches('universite', { title: 'Université de Montréal' })).toBe(true);
  });
});

describe('collectTerms', () => {
  it('tracks negation depth', () => {
    const r = parseQuery('alpha AND NOT (beta OR NOT gamma)');
    if (!r.ok) throw new Error();
    expect(collectTerms(r.query.text).map((c) => [c.term.value, c.negated])).toEqual([
      ['alpha', false],
      ['beta', true],
      ['gamma', false],
    ]);
  });
});

describe('stem', () => {
  it.each([
    ['networks', 'network'],
    ['studies', 'study'],
    ['learning', 'learn'],
    ['classes', 'class'],
    ['analysis', 'analysis'],
    ['virus', 'virus'],
  ])('%s → %s', (w, s) => expect(stem(w)).toBe(s));
});
