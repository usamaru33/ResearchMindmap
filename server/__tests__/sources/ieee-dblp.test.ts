import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseQuery, type ParsedQuery } from '../../../shared/query';
import { loadConfig } from '../../config';
import { HttpClient } from '../../infra/http';
import { compileDblp, dblpSource, normalizeDblpHit } from '../../sources/dblp';
import { compileIeee, ieeeSource, normalizeIeeeArticle } from '../../sources/ieee';

function q(input: string): ParsedQuery {
  const r = parseQuery(input);
  if (!r.ok) throw new Error(r.errors[0].message);
  return r.query;
}
const params = (url: string) => Object.fromEntries(new URL(url).searchParams);
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

describe('compileIeee', () => {
  it('renders IEEE field names and boolean operators', () => {
    const req = compileIeee(q('title:"body ownership" AND (avatar OR keyword:embodiment) NOT survey year:2018..2022 type:conference'), { limit: 10, apiKey: 'K' });
    const p = params(req.url);
    expect(p.querytext).toBe('"Document Title":"body ownership" AND (avatar OR "Author Keywords":embodiment) AND NOT survey');
    expect(p).toMatchObject({ start_year: '2018', end_year: '2022', content_type: 'Conferences', apikey: 'K', max_records: '10' });
    expect(req.approximate).toBe(false);
  });

  it('expands tiab and keeps wildcards', () => {
    const p = params(compileIeee(q('tiab:haptic*'), { limit: 5, apiKey: 'K' }).url);
    expect(p.querytext).toBe('("Document Title":haptic* OR "Abstract":haptic*)');
  });

  it('skips when another publisher is requested', () => {
    expect(compileIeee(q('vr publisher:acm'), { limit: 5, apiKey: 'K' }).skip).toBeTruthy();
  });
});

describe('IEEE source', () => {
  it('is disabled without an API key', async () => {
    const config = loadConfig({});
    expect(ieeeSource.status(config).enabled).toBe(false);
    const res = await ieeeSource.search(q('vr'), { limit: 5 }, { http: new HttpClient(), config });
    expect(res.papers).toEqual([]);
  });

  it('normalizes articles and only exposes PDFs that are open access', () => {
    const [locked, open] = fixture('ieee-search.json').articles.map(normalizeIeeeArticle);
    expect(locked).toMatchObject({
      id: 'doi:10.1109/vr.2019.8798222',
      title: 'The Effect of Avatar Size on Perceived Object Size in Virtual Reality',
      year: 2019,
      belongs: 'The University of Tokyo, Japan',
      citationCount: 42,
      publisher: 'ieee',
      type: 'proceedings-article',
      sources: ['ieee'],
    });
    expect(locked.pdfUrl).toBeUndefined();
    expect(locked.keywords).toEqual(['body ownership', 'size perception', 'Avatars', 'Virtual reality']);
    expect(open).toMatchObject({ id: 'ieee:9000001', year: 2021, type: 'journal-article' });
    expect(open.pdfUrl).toMatch(/arnumber=9000001/);
  });
});

describe('dblp', () => {
  it('sends positive words only', () => {
    const req = compileDblp(q('"body ownership" NOT survey (vr OR ar)'), { limit: 10 });
    expect(params(req.url)).toMatchObject({ q: 'body ownership vr ar', format: 'json', h: '20' });
    expect(req.approximate).toBe(true);
  });

  it('normalizes hits, single authors and venue arrays', () => {
    const hits = fixture('dblp-search.json').result.hits.hit.map((h: { info: never }) => normalizeDblpHit(h.info));
    expect(hits[0]).toMatchObject({
      id: 'doi:10.1371/journal.pone.0010564',
      title: 'First Person Experience of Body Transfer in Virtual Reality',
      authors: ['Mel Slater', 'Bernhard Spanlang'],
      year: 2010,
      type: 'journal-article',
      sources: ['dblp'],
    });
    expect(hits[1]).toMatchObject({
      id: 'arxiv:1907.07466',
      authors: ['Solo Author'],
      venue: 'CHI PLAY Companion',
      type: 'proceedings-article',
    });
  });

  it('is disabled unless explicitly enabled', () => {
    expect(dblpSource.status(loadConfig({})).enabled).toBe(false);
    expect(dblpSource.status(loadConfig({ ENABLE_DBLP: 'true' })).enabled).toBe(true);
  });

  it('turns a bot-check HTML page into an error instead of empty results', async () => {
    const http = new HttpClient({
      log: () => {},
      sleep: async () => {},
      fetch: (async () => new Response('<html>Making sure you are not a bot</html>', { status: 202, headers: { 'content-type': 'text/html' } })) as typeof fetch,
    });
    await expect(dblpSource.search(q('vr'), { limit: 5 }, { http, config: loadConfig({ ENABLE_DBLP: 'true' }) })).rejects.toThrow(/JSON ではない/);
  });
});
