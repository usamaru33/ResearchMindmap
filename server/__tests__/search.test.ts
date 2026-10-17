import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { parseQuery, type ParsedQuery } from '../../shared/query';
import type { Paper, SourceName } from '../../shared/types';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { enrichWithOpenAlex } from '../core/enrich';
import { searchAll, type SearchDeps } from '../core/search';
import { HttpClient } from '../infra/http';
import type { SourceAdapter, SourceResult } from '../sources/types';

function q(input: string): ParsedQuery {
  const r = parseQuery(input);
  if (!r.ok) throw new Error(r.errors[0].message);
  return r.query;
}

function adapter(name: SourceName, impl: () => Promise<SourceResult> | SourceResult, enabled = true): SourceAdapter {
  return {
    name,
    label: name,
    status: () => (enabled ? { enabled: true } : { enabled: false, reason: 'no key' }),
    search: async () => impl(),
  };
}

const paper = (title: string, extra: Partial<Paper>) => makePaper({ title, year: 2020, ...extra });

const deps = (adapters: SourceAdapter[], enrich?: SearchDeps['enrich']): SearchDeps => ({
  http: new HttpClient({ log: () => {} }),
  config: loadConfig({}),
  adapters,
  enrich: enrich ?? (async (papers) => ({ papers, enriched: 0 })),
});

const opts = { limitPerSource: 10, limit: 50, enrich: true };

describe('searchAll', () => {
  it('merges sources, reports per source, and keeps going when one fails', async () => {
    const shared = { ids: { doi: '10.1/shared' } };
    const out = await searchAll(
      q('virtual reality'),
      opts,
      deps([
        adapter('openalex', () => ({
          papers: [paper('Virtual Reality Shared Paper Title', { ...shared, sources: ['openalex'] }), paper('Virtual reality only in OpenAlex', { ids: { doi: '10.1/oa' }, sources: ['openalex'] })],
          total: 100,
          warnings: [],
          approximate: false,
        })),
        adapter('crossref', () => ({
          papers: [paper('Virtual Reality Shared Paper Title', { ...shared, sources: ['crossref'] })],
          warnings: ['approx'],
          approximate: true,
        })),
        adapter('semanticscholar', () => {
          throw new Error('semanticscholar: HTTP 429');
        }),
        adapter('ieee', () => ({ papers: [], warnings: [], approximate: false }), false),
      ]),
    );
    expect(out.results.map((p) => p.ids?.doi)).toEqual(['10.1/shared', '10.1/oa']);
    expect(out.results[0].sources).toEqual(['openalex', 'crossref']);
    const byName = Object.fromEntries(out.perSource.map((r) => [r.name, r]));
    expect(byName.openalex).toMatchObject({ status: 'ok', count: 2, kept: 2, total: 100 });
    expect(byName.crossref).toMatchObject({ status: 'ok', count: 1, kept: 1, approximate: true, warnings: ['approx'] });
    expect(byName.semanticscholar).toMatchObject({ status: 'error', error: 'semanticscholar: HTTP 429' });
    expect(byName.ieee).toMatchObject({ status: 'skipped', error: 'no key' });
  });

  it('post-filters results that only approximate sources returned', async () => {
    const out = await searchAll(
      q('"body ownership" NOT survey publisher:acm'),
      opts,
      deps([
        adapter('crossref', () => ({
          papers: [
            paper('Body ownership in virtual reality experiments', { ids: { doi: '10.1145/a' } }),
            paper('A survey of body ownership illusions overall', { ids: { doi: '10.1145/b' } }),
            paper('Body ownership and robots in the real world', { ids: { doi: '10.1109/c' } }),
            paper('Ownership of the body in other sense entirely', { ids: { doi: '10.1145/d' } }),
          ].map((p) => ({ ...p, sources: ['crossref' as const] })),
          warnings: [],
          approximate: true,
        })),
      ]),
    );
    expect(out.results.map((p) => p.ids?.doi)).toEqual(['10.1145/a']);
    expect(out.candidates).toBe(4);
    expect(out.perSource[0]).toMatchObject({ count: 4, kept: 1 });
  });

  it('re-checks after enrichment so abstracts can satisfy the query', async () => {
    const out = await searchAll(
      q('avatar embodiment'),
      opts,
      deps(
        [adapter('crossref', () => ({ papers: [paper('Avatars in VR studies of size', { ids: { doi: '10.1/x' }, sources: ['crossref'] })], warnings: [], approximate: true }))],
        async (papers) => ({ papers: papers.map((p) => ({ ...p, abstract: 'We study embodiment.' })), enriched: 1 }),
      ),
    );
    expect(out.results).toHaveLength(1);
    expect(out.enriched).toBe(1);
  });

  it('respects the requested source list and result limit', async () => {
    const many = Array.from({ length: 30 }, (_, i) => paper(`Virtual reality paper number ${i} in the list`, { ids: { doi: `10.1/${i}` }, sources: ['openalex'] }));
    const out = await searchAll(
      q('virtual'),
      { ...opts, limit: 5, sources: ['openalex'] },
      deps([
        adapter('openalex', () => ({ papers: many, warnings: [], approximate: false })),
        adapter('crossref', () => {
          throw new Error('should not run');
        }),
      ]),
    );
    expect(out.results).toHaveLength(5);
    expect(out.perSource.map((r) => r.name)).toEqual(['openalex']);
  });
});

describe('enrichWithOpenAlex', () => {
  it('fills missing fields by DOI in one batched call and keeps original sources', async () => {
    const calls: string[] = [];
    const http = new HttpClient({
      log: () => {},
      fetch: (async (url: string | URL | Request) => {
        calls.push(String(url));
        return new Response(
          JSON.stringify({
            results: [
              {
                id: 'https://openalex.org/W1',
                doi: 'https://doi.org/10.1145/abc',
                title: 'T',
                publication_year: 2020,
                abstract_inverted_index: { Hello: [0], world: [1] },
                referenced_works: ['https://openalex.org/W9'],
                cited_by_count: 7,
              },
            ],
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }) as typeof fetch,
    });
    const input = [
      paper('Some Crossref Paper Title Here', { ids: { doi: '10.1145/ABC'.toLowerCase() }, sources: ['crossref'] }),
      paper('An arXiv Only Paper Title Here', { ids: { arxiv: '2101.00001' }, sources: ['arxiv'] }),
      paper('No identifiers at all on this one', {}),
    ];
    const { papers, enriched } = await enrichWithOpenAlex(input, { http });
    expect(calls).toHaveLength(1);
    expect(decodeURIComponent(calls[0])).toContain('doi:10.1145/abc|10.48550/arxiv.2101.00001');
    expect(enriched).toBe(1);
    expect(papers[0]).toMatchObject({ abstract: 'Hello world', citationCount: 7, referenceIds: ['W9'], sources: ['crossref'] });
    expect(papers[0].ids?.openalex).toBe('W1');
  });
});

describe('POST /api/search validation', () => {
  const app = createApp(loadConfig({}));
  const post = (body: unknown) =>
    app.request('/api/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('rejects syntax errors with positions', async () => {
    const res = await post({ query: '(vr OR' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_query', details: [{ start: 4 }] } });
  });

  it('rejects unknown sources and out-of-range limits', async () => {
    expect((await post({ query: 'vr', sources: ['google'] })).status).toBe(400);
    expect((await post({ query: 'vr', limit: 1000 })).status).toBe(400);
  });
});
