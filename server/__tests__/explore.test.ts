import { describe, expect, it } from 'vitest';
import type { ExploreSearchResponse, ExploreWorksResponse } from '../../shared/types';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { entityWorks, searchEntities } from '../core/explore';
import { HttpClient } from '../infra/http';
import { createServices } from '../services';

function fakeOpenAlex(routes: Array<[RegExp, unknown]>) {
  const calls: string[] = [];
  const http = new HttpClient({
    log: () => {},
    fetch: (async (input: string | URL | Request) => {
      const url = decodeURIComponent(String(input));
      calls.push(url);
      const hit = routes.find(([re]) => re.test(url));
      if (!hit) return new Response('{"error":"not found"}', { status: 404, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify(hit[1]), { headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
  });
  return { http, calls };
}

const lecun = {
  id: 'https://openalex.org/A5001226970',
  display_name: 'Yann LeCun',
  orcid: 'https://orcid.org/0000-0002-1992-2684',
  works_count: 548,
  cited_by_count: 210105,
  last_known_institutions: [{ display_name: 'New York University', country_code: 'US' }],
  topics: [{ display_name: 'Advanced Neural Network Applications' }, { display_name: 'Domain Adaptation' }],
  summary_stats: { h_index: 129 },
};

const chi = {
  id: 'https://openalex.org/S4363607743',
  display_name: 'CHI Conference on Human Factors in Computing Systems',
  works_count: 9540,
  cited_by_count: 329546,
  host_organization_name: null,
  type: 'conference',
  summary_stats: { h_index: 184 },
};

const work = (id: string, title: string, year: number, cites: number) => ({
  id: `https://openalex.org/${id}`,
  title,
  publication_year: year,
  cited_by_count: cites,
  authorships: [{ author: { display_name: 'Yann LeCun' } }, { author: { display_name: 'Léon Bottou' } }],
});

describe('searchEntities', () => {
  it('maps authors with institution, h-index, topics and ORCID', async () => {
    const { http, calls } = fakeOpenAlex([[/\/authors\?search=yann\+lecun/, { results: [lecun] }]]);
    const [a] = await searchEntities('author', 'yann lecun', { http });
    expect(a).toEqual({
      kind: 'author',
      id: 'A5001226970',
      name: 'Yann LeCun',
      detail: 'New York University, US',
      worksCount: 548,
      citedByCount: 210105,
      hIndex: 129,
      topics: ['Advanced Neural Network Applications', 'Domain Adaptation'],
      orcid: '0000-0002-1992-2684',
    });
    expect(calls[0]).toContain('per-page=10');
  });

  it('maps venues to the sources endpoint', async () => {
    const { http, calls } = fakeOpenAlex([[/\/sources\?search=chi/, { results: [chi] }]]);
    const [v] = await searchEntities('venue', 'chi', { http });
    expect(v).toMatchObject({ kind: 'venue', id: 'S4363607743', detail: 'conference', topics: [] });
    expect(calls[0]).toContain('/sources?');
  });
});

describe('entityWorks', () => {
  it('filters by author, sorts, and adds a year histogram', async () => {
    const { http, calls } = fakeOpenAlex([
      [/group_by=publication_year/, { group_by: [{ key: '2015', count: 3 }, { key: '1998', count: 1 }] }],
      [/\/works\?filter=authorships\.author\.id:A1,publication_year:2010-2020/, { meta: { count: 2 }, results: [work('W1', 'Deep learning', 2015, 90), work('W2', 'Other', 2012, 5)] }],
    ]);
    const out = await entityWorks('author', 'A1', { limit: 50, sort: 'recent', yearMin: 2010, yearMax: 2020 }, { http });
    expect(out.papers.map((p) => p.title)).toEqual(['Deep learning', 'Other']);
    expect(out.papers[0].authors).toEqual(['Yann LeCun', 'Léon Bottou']);
    expect(out.total).toBe(2);
    expect(out.byYear).toEqual([
      { year: 1998, count: 1 },
      { year: 2015, count: 3 },
    ]);
    expect(calls[0]).toContain('sort=publication_date:desc');
  });

  it('pages past 100 and keeps the list when the histogram fails', async () => {
    const page = (n: number, from: number) => Array.from({ length: n }, (_, i) => work(`W${from + i}`, `Paper ${from + i}`, 2020, 1));
    const { http, calls } = fakeOpenAlex([
      [/primary_location\.source\.id:S9.*page=1&/, { meta: { count: 150 }, results: page(100, 0) }],
      [/primary_location\.source\.id:S9.*page=2&/, { meta: { count: 150 }, results: page(50, 100) }],
    ]);
    const out = await entityWorks('venue', 'S9', { limit: 200, sort: 'cited' }, { http });
    expect(out.papers).toHaveLength(150);
    expect(out.byYear).toEqual([]);
    expect(calls.filter((u) => u.includes('per-page'))).toHaveLength(2);
  });
});

describe('/api/explore', () => {
  const app = (routes: Array<[RegExp, unknown]>) => {
    const config = loadConfig({ CACHE_TTL_HOURS: '0' });
    return createApp(config, createServices(config, { http: fakeOpenAlex(routes).http }));
  };

  it('searches entities', async () => {
    const res = await app([[/\/authors\?/, { results: [lecun] }]]).request('/api/explore/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'author', query: 'lecun' }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as ExploreSearchResponse).entities[0].name).toBe('Yann LeCun');
  });

  it('rejects an id of the wrong kind', async () => {
    const res = await app([]).request('/api/explore/works', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'author', id: 'S1' }) });
    expect(res.status).toBe(400);
  });

  it('lists works', async () => {
    const res = await app([
      [/group_by/, { group_by: [] }],
      [/\/works\?/, { meta: { count: 1 }, results: [work('W1', 'Deep learning', 2015, 90)] }],
    ]).request('/api/explore/works', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'author', id: 'A5001226970', limit: 10 }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ExploreWorksResponse;
    expect(body.papers[0].title).toBe('Deep learning');
  });

  it('reports upstream failures as 502', async () => {
    const res = await app([]).request('/api/explore/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'venue', query: 'chi' }) });
    expect(res.status).toBe(502);
  });
});
