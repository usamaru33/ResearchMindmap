import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { expandPaper } from '../core/expand';
import { HttpClient } from '../infra/http';

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

const work = (id: string, title: string, cites: number) => ({
  id: `https://openalex.org/${id}`,
  doi: `https://doi.org/10.1/${id.toLowerCase()}`,
  title,
  publication_year: 2020,
  cited_by_count: cites,
});

const seed = makePaper({ title: 'Seed paper', year: 2018, ids: { doi: '10.1109/x' } });

describe('expandPaper', () => {
  it('resolves by DOI and returns references sorted by citations', async () => {
    const { http, calls } = fakeOpenAlex([
      [/works\/doi:10\.1109\/x\?/, { id: 'https://openalex.org/W1', referenced_works: ['https://openalex.org/W2', 'https://openalex.org/W3'] }],
      [/filter=openalex:W2\|W3/, { results: [work('W2', 'Less cited', 5), work('W3', 'More cited', 50)] }],
    ]);
    const out = await expandPaper(seed, 'references', 10, { http });
    expect(out.papers.map((p) => p.title)).toEqual(['More cited', 'Less cited']);
    expect(out.total).toBe(2);
    expect(calls).toHaveLength(2);
  });

  it('lists citing papers with the cites filter', async () => {
    const { http, calls } = fakeOpenAlex([
      [/works\/W1\?/, { id: 'https://openalex.org/W1' }],
      [/filter=cites:W1/, { meta: { count: 77 }, results: [work('W9', 'Follow-up', 3)] }],
    ]);
    const out = await expandPaper({ ...seed, ids: { openalex: 'W1' } }, 'citations', 5, { http });
    expect(out).toMatchObject({ total: 77, papers: [{ title: 'Follow-up' }] });
    expect(calls[1]).toContain('sort=cited_by_count:desc');
    expect(calls[1]).toContain('per-page=5');
  });

  it('uses related_works for related papers', async () => {
    const { http } = fakeOpenAlex([
      [/works\/W1\?/, { id: 'https://openalex.org/W1', related_works: ['https://openalex.org/W5'] }],
      [/filter=openalex:W5/, { results: [work('W5', 'Neighbour', 1)] }],
    ]);
    const out = await expandPaper({ ...seed, ids: { openalex: 'W1' } }, 'related', 5, { http });
    expect(out.papers[0].title).toBe('Neighbour');
  });

  it('explains when the paper cannot be found', async () => {
    const { http } = fakeOpenAlex([]);
    const noIds = await expandPaper(makePaper({ title: 'Hand-written note' }), 'references', 5, { http });
    expect(noIds.warnings[0]).toMatch(/DOI か arXiv ID/);
    const missing = await expandPaper(seed, 'references', 5, { http });
    expect(missing.papers).toEqual([]);
  });
});
