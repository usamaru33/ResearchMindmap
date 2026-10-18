import { describe, expect, it } from 'vitest';
import type { RecommendResponse } from '../../shared/types';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { recommendPapers } from '../core/recommend';
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

const oa = (id: string) => `https://openalex.org/${id}`;
const work = (id: string, title: string, cites: number, refs: string[] = []) => ({
  id: oa(id),
  title,
  publication_year: 2020,
  cited_by_count: cites,
  referenced_works: refs.map(oa),
});

// Three seeds: W101 and W102 by OpenAlex id, W103 found by DOI.
const seeds = [
  { id: 's1', ids: { openalex: 'W101' } },
  { id: 's2', ids: { openalex: 'W102' } },
  { id: 's3', ids: { doi: '10.1145/3313831' } },
];
const routes: Array<[RegExp, unknown]> = [
  [/filter=openalex:W101\|W102&.*select=id,referenced_works,related_works/, {
    results: [
      { id: oa('W101'), referenced_works: [oa('W201'), oa('W202'), oa('W900')], related_works: [oa('W301')] },
      { id: oa('W102'), referenced_works: [oa('W201'), oa('W900')], related_works: [oa('W301')] },
    ],
  }],
  [/filter=doi:10\.1145\/3313831&/, { results: [{ id: oa('W103'), referenced_works: [oa('W201'), oa('W101')], related_works: [oa('W301'), oa('W302')] }] }],
  [/filter=cites:W101\|W102\|W103/, {
    results: [
      work('W401', 'Builds on two seeds', 500, ['W101', 'W102']),
      work('W402', 'Cites one seed', 9000, ['W103']),
    ],
  }],
  [/filter=openalex:W201\|W301|filter=openalex:W301\|W201/, { results: [work('W201', 'Foundation', 800), work('W301', 'Related to all', 50)] }],
];

describe('recommendPapers', () => {
  it('ranks by how many seeds point to each candidate', async () => {
    const { http } = fakeOpenAlex(routes);
    const out = await recommendPapers(seeds, ['W900'], 10, { http });
    expect(out.papers.map((p) => p.title)).toEqual(['Foundation', 'Builds on two seeds', 'Related to all']);
    expect(out.seeds).toBe(3);
    const byTitle = Object.fromEntries(out.papers.map((p) => [p.title, out.reasons[p.id]]));
    expect(byTitle.Foundation).toEqual({ cocited: 3, citing: 0, related: 0 });
    expect(byTitle['Builds on two seeds']).toEqual({ cocited: 0, citing: 2, related: 0 });
    expect(byTitle['Related to all']).toEqual({ cocited: 0, citing: 0, related: 3 });
  });

  it('skips seeds, excluded papers and weak single links', async () => {
    const { http } = fakeOpenAlex(routes);
    const out = await recommendPapers(seeds, ['W900'], 10, { http });
    const titles = out.papers.map((p) => p.title);
    expect(titles).not.toContain('Cites one seed');
    expect(out.papers.some((p) => ['W101', 'W900', 'W202', 'W302'].includes(p.ids?.openalex ?? ''))).toBe(false);
  });

  it('still answers when the forward query fails', async () => {
    const { http } = fakeOpenAlex(routes.filter(([re]) => !String(re).includes('cites')));
    const out = await recommendPapers(seeds, ['W900'], 10, { http });
    expect(out.papers.map((p) => p.title)).toEqual(['Foundation', 'Related to all']);
  });
});

describe('POST /api/papers/recommend', () => {
  it('validates and returns recommendations', async () => {
    const config = loadConfig({ CACHE_TTL_HOURS: '0' });
    const app = createApp(config, createServices(config, { http: fakeOpenAlex(routes).http }));
    const bad = await app.request('/api/papers/recommend', { method: 'POST', body: JSON.stringify({ seeds: [] }) });
    expect(bad.status).toBe(400);
    const res = await app.request('/api/papers/recommend', { method: 'POST', body: JSON.stringify({ seeds, exclude: ['W900'] }) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as RecommendResponse).papers[0].title).toBe('Foundation');
  });
});
