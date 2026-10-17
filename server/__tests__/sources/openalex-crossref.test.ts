import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseQuery, type ParsedQuery } from '../../../shared/query';
import { compileCrossref, normalizeCrossrefItem, type CrossrefItem } from '../../sources/crossref';
import { compileOpenAlex, normalizeOpenAlexWork, rebuildAbstract, type OpenAlexWork } from '../../sources/openalex';

function q(input: string): ParsedQuery {
  const r = parseQuery(input);
  if (!r.ok) throw new Error(r.errors[0].message);
  return r.query;
}

const params = (url: string) => Object.fromEntries(new URL(url).searchParams);
const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

describe('compileOpenAlex', () => {
  it('sends boolean text to `search` and filters to `filter`', () => {
    const req = compileOpenAlex(q('"body ownership" AND (vr OR "virtual reality") NOT survey year:2015..2024 oa:true'), { limit: 20 });
    const p = params(req.url);
    expect(p.search).toBe('"body ownership" AND (vr OR "virtual reality") AND NOT survey');
    expect(p.filter).toBe('publication_year:2015-2024,is_oa:true');
    expect(p['per-page']).toBe('20');
    expect(req.approximate).toBe(false);
  });

  it('maps fields to scoped search parameters and author filters', () => {
    const p = params(compileOpenAlex(q('title:transformer tiab:"protein folding" author:Jumper'), { limit: 10 }).url);
    expect(p['search.title']).toBe('transformer');
    expect(p['search.title_abstract_keywords']).toBe('"protein folding"');
    expect(p.filter).toBe('raw_author_name.search:Jumper');
  });

  it('uses the host organization for IEEE but filters ACM locally', () => {
    const ieee = compileOpenAlex(q('haptics publisher:ieee'), { limit: 10 });
    expect(params(ieee.url).filter).toBe('primary_location.source.host_organization_lineage:P4310319808');
    expect(ieee.approximate).toBe(false);

    const acm = compileOpenAlex(q('haptics publisher:acm'), { limit: 10 });
    expect(params(acm.url).filter).toBeUndefined();
    expect(acm.approximate).toBe(true);
    expect(params(acm.url)['per-page']).toBe('20');
  });

  it('flags venue, wildcard and mixed-field OR as approximate with warnings', () => {
    const req = compileOpenAlex(q('venue:CHI robot* (title:vr OR author:smith)'), { limit: 10 });
    expect(req.approximate).toBe(true);
    expect(req.warnings.join()).toMatch(/掲載先名/);
    expect(req.warnings.join()).toMatch(/ワイルドカード/);
    expect(req.warnings.join()).toMatch(/異なるフィールド/);
    expect(params(req.url).search).toBe('robot AND (vr OR smith)');
  });

  it('adds the API key when configured', () => {
    expect(params(compileOpenAlex(q('x1'), { limit: 1, apiKey: 'K' }).url).api_key).toBe('K');
  });
});

describe('normalizeOpenAlexWork', () => {
  const works: OpenAlexWork[] = fixture('openalex-search.json').results;

  it('maps the main fields', () => {
    const p = normalizeOpenAlexWork(works[0]);
    expect(p.title).toBe('The Sense of Embodiment in Virtual Reality');
    expect(p.id).toMatch(/^doi:10\./);
    expect(p.ids?.openalex).toMatch(/^W\d+$/);
    expect(p.year).toBeGreaterThan(2000);
    expect(p.authors.length).toBeGreaterThan(0);
    expect(p.abstract.length).toBeGreaterThan(50);
    expect(p.citationCount).toBeGreaterThan(0);
    expect(p.referenceIds?.[0]).toMatch(/^W\d+$/);
    expect(p.topics?.some((t) => t.level === 'subfield')).toBe(true);
    expect(p.sources).toEqual(['openalex']);
  });

  it('rebuilds abstracts from the inverted index', () => {
    expect(rebuildAbstract({ world: [1], Hello: [0], again: [3], hello: [2] })).toBe('Hello world hello again');
    expect(rebuildAbstract(null)).toBe('');
  });
});

describe('compileCrossref', () => {
  it('sends positive words as bag-of-words and maps filters', () => {
    const req = compileCrossref(q('"body ownership" NOT survey author:slater venue:VRST year:2015..2020 publisher:(acm OR ieee) type:conference'), { limit: 10, mailto: 'me@example.org' });
    const p = params(req.url);
    expect(p['query.bibliographic']).toBe('body ownership');
    expect(p['query.author']).toBe('slater');
    expect(p['query.container-title']).toBe('VRST');
    expect(p.filter).toBe('from-pub-date:2015,until-pub-date:2020,prefix:10.1145,prefix:10.1109,type:proceedings-article');
    expect(p.mailto).toBe('me@example.org');
    expect(req.approximate).toBe(true);
    expect(req.warnings.join()).toMatch(/ブール演算/);
  });
});

describe('normalizeCrossrefItem', () => {
  const items: CrossrefItem[] = fixture('crossref-search.json').message.items;

  it('maps the main fields and infers ACM from the DOI', () => {
    const p = normalizeCrossrefItem(items[0]);
    expect(p.id).toBe(`doi:${items[0].DOI.toLowerCase()}`);
    expect(p.title).toMatch(/Body Ownership/);
    expect(p.publisher).toBe('acm');
    expect(p.venue).toMatch(/Virtual Reality Software and Technology/);
    expect(p.year).toBe(2016);
    expect(p.sources).toEqual(['crossref']);
  });

  it('strips JATS markup from abstracts', () => {
    const p = normalizeCrossrefItem({ DOI: '10.1/x', title: ['T'], abstract: '<jats:title>Abstract</jats:title><jats:p>Hello <jats:italic>world</jats:italic></jats:p>' });
    expect(p.abstract).toBe('Hello world');
  });
});
