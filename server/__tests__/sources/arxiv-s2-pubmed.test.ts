import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseQuery, type ParsedQuery } from '../../../shared/query';
import { compileArxiv, normalizeArxivEntry, parseArxivFeed } from '../../sources/arxiv';
import { compilePubmed, compilePubmedTerm, parsePubmedArticles } from '../../sources/pubmed';
import { compileSemanticScholar, normalizeS2Paper, type S2Paper } from '../../sources/semanticscholar';

function q(input: string): ParsedQuery {
  const r = parseQuery(input);
  if (!r.ok) throw new Error(r.errors[0].message);
  return r.query;
}
const params = (url: string) => Object.fromEntries(new URL(url).searchParams);
const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

describe('compileArxiv', () => {
  it('maps fields to arXiv prefixes and NOT to ANDNOT', () => {
    const req = compileArxiv(q('title:"body ownership" AND (vr OR abstract:avatar) NOT survey'), { limit: 10 });
    expect(params(req.url).search_query).toBe('ti:"body ownership" AND (all:vr OR abs:avatar) ANDNOT all:survey');
    expect(req.approximate).toBe(false);
  });

  it('expands tiab to title OR abstract and adds a date range', () => {
    const req = compileArxiv(q('tiab:haptics year:2019..2021'), { limit: 5 });
    expect(params(req.url).search_query).toBe('((ti:haptics OR abs:haptics)) AND submittedDate:[201901010000 TO 202112312359]');
  });

  it('broadens a NOT inside OR and marks the result approximate', () => {
    const req = compileArxiv(q('vr AND (haptics OR NOT survey)'), { limit: 5 });
    expect(params(req.url).search_query).toBe('all:vr');
    expect(req.approximate).toBe(true);
  });

  it('skips arXiv when another publisher is requested', () => {
    expect(compileArxiv(q('vr publisher:acm'), { limit: 5 }).skip).toBeTruthy();
    expect(compileArxiv(q('vr publisher:arxiv'), { limit: 5 }).skip).toBeUndefined();
  });
});

describe('arXiv feed', () => {
  it('parses entries into papers', () => {
    const feed = parseArxivFeed(fixture('arxiv-search.xml'));
    expect(feed.total).toBe(4);
    const p = normalizeArxivEntry(feed.entries[0]);
    expect(p).toMatchObject({
      id: 'arxiv:1907.05220',
      title: 'The Illusion of Animal Body Ownership and Its Potential for Virtual Reality Games',
      year: 2019,
      venue: 'arXiv',
      pdfUrl: 'https://arxiv.org/pdf/1907.05220v1',
      type: 'preprint',
      sources: ['arxiv'],
    });
    expect(p.authors).toEqual(['Andrey Krekhov', 'Sebastian Cmentowski', 'Jens Krüger']);
    expect(p.keywords).toEqual(['cs.HC']);
    expect(p.abstract).toMatch(/^Virtual reality offers/);
  });
});

describe('compileSemanticScholar', () => {
  it('sends positive words and maps filters', () => {
    const req = compileSemanticScholar(q('"body ownership" NOT survey venue:CHI year:2015.. oa:true type:conference'), { limit: 10 });
    const p = params(req.url);
    expect(p.query).toBe('body ownership');
    expect(p.venue).toBe('CHI');
    expect(p.year).toBe('2015-');
    expect(p).toHaveProperty('openAccessPdf', '');
    expect(p.publicationTypes).toBe('Conference');
    expect(p.limit).toBe('20');
    expect(req.approximate).toBe(true);
  });
});

describe('normalizeS2Paper', () => {
  const data: S2Paper[] = JSON.parse(fixture('s2-search.json')).data;

  it('maps ids, venue and open access PDF', () => {
    const p = normalizeS2Paper(data[0]);
    expect(p.id).toBe('doi:10.1162/pres_a_00124');
    expect(p.ids?.s2).toBe(data[0].paperId);
    expect(p.venue).toBe('Presence: Teleoperators & Virtual Environments');
    expect(p.pdfUrl).toBe('https://example.org/embodiment.pdf');
    expect(p.keywords).toEqual(['Computer Science', 'Psychology']);
  });

  it('falls back to arXiv ids and tolerates nulls', () => {
    const p = normalizeS2Paper(data[1]);
    expect(p.id).toBe('arxiv:2105.01234');
    expect(p.abstract).toBe('');
    expect(p.pdfUrl).toBeUndefined();
  });
});

describe('compilePubmed', () => {
  it('adds field tags, binary NOT and filters', () => {
    const { term } = compilePubmedTerm(q('tiab:"body ownership" AND (vr OR "virtual reality") NOT author:smith year:2018..2022 lang:en oa:true type:review'));
    expect(term).toBe(
      '("body ownership"[tiab] AND (vr[all] OR "virtual reality"[all]) NOT smith[au]) AND 2018:2022[dp] AND english[la] AND ("review"[pt]) AND "free full text"[sb]',
    );
  });

  it('keeps wildcards and builds the esearch URL', () => {
    const req = compilePubmed(q('robot*'), { limit: 5, apiKey: 'K', email: 'a@b.c' });
    const p = params(req.url);
    expect(p.term).toBe('robot*[all]');
    expect(p.api_key).toBe('K');
    expect(p.email).toBe('a@b.c');
    expect(p.sort).toBe('relevance');
  });
});

describe('PubMed efetch', () => {
  it('parses articles with structured abstracts, DOIs and MeSH', () => {
    const papers = parsePubmedArticles(fixture('pubmed-efetch.xml'));
    expect(papers.length).toBe(3);
    const first = papers[0];
    expect(first.ids?.pmid).toMatch(/^\d+$/);
    expect(first.title).toMatch(/Body ownership/i);
    expect(first.ids?.doi).toMatch(/^10\./);
    expect(first.authors).toContain('Mel Slater');
    expect(first.belongs).toMatch(/Event Lab/);
    expect(first.abstract.length).toBeGreaterThan(100);
    expect(first.keywords).toContain('Virtual Reality');
    expect(first.year).toBeGreaterThan(2000);
    expect(first.sources).toEqual(['pubmed']);
  });
});
