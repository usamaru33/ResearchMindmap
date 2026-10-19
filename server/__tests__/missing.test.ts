import { describe, expect, it } from 'vitest';
import type { MissingResponse } from '../../shared/types';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { findMissingPapers } from '../core/missing';
import { HttpClient } from '../infra/http';
import { createServices } from '../services';

function fakeOpenAlex(routes: Array<[RegExp, unknown]>, failing: RegExp[] = []) {
  const calls: string[] = [];
  const http = new HttpClient({
    log: () => {},
    maxRetries: 0,
    fetch: (async (input: string | URL | Request) => {
      const url = decodeURIComponent(String(input));
      calls.push(url);
      if (failing.some((re) => re.test(url))) return new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } });
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

// The map: m1–m3 by OpenAlex id, m4 by DOI (OpenAlex W104).
const map = [
  { id: 'm1', ids: { openalex: 'W101' } },
  { id: 'm2', ids: { openalex: 'W102' } },
  { id: 'm3', ids: { openalex: 'W103' } },
  { id: 'm4', ids: { doi: '10.1234/four' } },
];
const seedRoutes: Array<[RegExp, unknown]> = [
  [
    /filter=openalex:W101\|W102\|W103&.*select=id,doi,referenced_works/,
    {
      results: [
        // W900 (foundation) is cited by m1, m2, m3; W102 (in the map) by m1 and m3.
        { id: oa('W101'), doi: null, referenced_works: [oa('W900'), oa('W102'), oa('W901')] },
        { id: oa('W102'), doi: null, referenced_works: [oa('W900')] },
        { id: oa('W103'), doi: null, referenced_works: [oa('W900'), oa('W102')] },
      ],
    },
  ],
  [/filter=doi:10\.1234\/four&/, { results: [{ id: oa('W104'), doi: 'https://doi.org/10.1234/four', referenced_works: [oa('W901')] }] }],
];
// Works citing the map: W500 cites m1 and m2 (follow-up); W501–W503 each cite one map paper and W950 (co-cited).
const citing = {
  results: [
    work('W500', 'Follow-up study', 300, ['W101', 'W102', 'W950']),
    work('W501', 'Other A', 50, ['W101', 'W950']),
    work('W502', 'Other B', 40, ['W103', 'W950']),
    work('W503', 'Other C', 30, ['W104', 'W950', 'W999']),
  ],
};
const details = {
  results: [work('W900', 'The foundation', 9000), work('W901', 'Cited twice', 120), work('W950', 'Co-cited classic', 5000)],
};
const routes: Array<[RegExp, unknown]> = [...seedRoutes, [/filter=cites:/, citing], [/filter=openalex:W/, details]];

describe('findMissingPapers', () => {
  it('finds foundations, follow-up work and co-cited works, with the map papers as evidence', async () => {
    const { http } = fakeOpenAlex(routes);
    const res = await findMissingPapers(map, 40, { http });
    const byTitle = Object.fromEntries(res.candidates.map((c) => [c.paper.title, c]));
    expect(byTitle['The foundation'].citedBy.sort()).toEqual(['m1', 'm2', 'm3']);
    expect(byTitle['Cited twice'].citedBy.sort()).toEqual(['m1', 'm4']);
    expect(byTitle['Follow-up study'].cites.sort()).toEqual(['m1', 'm2']);
    expect(byTitle['Co-cited classic'].cocited).toBe(4);
    // W999 is co-cited once only; W102 is in the map already.
    expect(res.candidates.map((c) => c.paper.ids?.openalex)).not.toContain('W999');
    expect(res.candidates.map((c) => c.paper.ids?.openalex)).not.toContain('W102');
    // Co-cited by all 4 citing works counts like being cited by all 4 map papers (score 4), above 3 of 4 map papers.
    expect(res.candidates.slice(0, 2).map((c) => [c.paper.title, c.score])).toEqual([
      ['Co-cited classic', 4],
      ['The foundation', 3],
    ]);
    expect(res.seeds).toBe(4);
    expect(res.citingWorks).toBe(4);
    expect(res.failed).toEqual([]);
  });

  it('measures coverage: of the works cited by at least two map papers, how many are in the map', async () => {
    const { http } = fakeOpenAlex(routes);
    const { coverage } = await findMissingPapers(map, 40, { http });
    // W900 (3), W102 (2, in the map), W901 (2).
    expect(coverage).toEqual({ threshold: 2, total: 3, inMap: 1 });
  });

  it('still returns foundations and coverage when the citing works cannot be fetched', async () => {
    const { http } = fakeOpenAlex(routes, [/filter=cites:/]);
    const res = await findMissingPapers(map, 40, { http });
    expect(res.failed).toEqual(['forward']);
    expect(res.candidates.map((c) => c.paper.title)).toEqual(['The foundation', 'Cited twice']);
  });

  it('is served at POST /api/papers/missing and validates its input', async () => {
    const { http } = fakeOpenAlex(routes);
    const config = loadConfig({});
    const app = createApp(config, { ...createServices(config), http });
    const post = (body: unknown) =>
      app.request('/api/papers/missing', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ papers: [] })).status).toBe(400);
    const res = await post({ papers: map, limit: 2 });
    expect(res.status).toBe(200);
    expect(((await res.json()) as MissingResponse).candidates).toHaveLength(2);
  });
});
