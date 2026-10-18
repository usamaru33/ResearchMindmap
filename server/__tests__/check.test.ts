import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { checkPapers, pickPublished } from '../core/check';
import { HttpClient } from '../infra/http';

function http(handler: (url: string) => unknown) {
  const calls: string[] = [];
  return {
    calls,
    http: new HttpClient({
      log: () => {},
      sleep: async () => {},
      fetch: (async (input: string | URL | Request) => {
        const url = decodeURIComponent(String(input)).replace(/\+/g, ' ');
        calls.push(url);
        const body = handler(url);
        return new Response(JSON.stringify(body ?? { error: 'nf' }), { status: body ? 200 : 500, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch,
    }),
  };
}

const preprint = { id: 'arxiv:1512.03385', title: 'Deep Residual Learning for Image Recognition', year: 2015, type: 'preprint', authors: ['Kaiming He'], ids: { arxiv: '1512.03385' } };

describe('pickPublished', () => {
  const candidate = (patch: object) => makePaper({ title: 'Deep Residual Learning for Image Recognition', year: 2016, authors: ['Kaiming He'], venue: 'CVPR', ids: { doi: '10.1109/cvpr.2016.90' }, type: 'article', ...patch });

  it('accepts the same title and first author, not earlier, with a real DOI', () => {
    expect(pickPublished(preprint, [candidate({})])?.venue).toBe('CVPR');
    expect(pickPublished(preprint, [candidate({ authors: ['Someone Else'] })])).toBeNull();
    expect(pickPublished(preprint, [candidate({ ids: { doi: '10.48550/arxiv.1512.03385' } })])).toBeNull();
    expect(pickPublished(preprint, [candidate({ title: 'Deep Residual Learning for Image Recognition: A Survey of Methods' })])).toBeNull();
    expect(pickPublished(preprint, [candidate({ year: 2010 })])).toBeNull();
  });
});

describe('checkPapers', () => {
  it('finds retractions in batches and published versions of preprints', async () => {
    const { http: h, calls } = http((url) => {
      if (url.includes('is_retracted:true')) return { results: [{ id: 'https://openalex.org/W7', doi: 'https://doi.org/10.1016/x', is_retracted: true }] };
      if (url.includes('search.title=')) {
        return {
          results: [
            {
              id: 'https://openalex.org/W2194775991',
              doi: 'https://doi.org/10.1109/cvpr.2016.90',
              title: 'Deep Residual Learning for Image Recognition',
              publication_year: 2016,
              type: 'article',
              authorships: [{ author: { display_name: 'Kaiming He' } }],
              primary_location: { source: { display_name: 'CVPR' } },
            },
          ],
        };
      }
      return null;
    });
    const papers = [
      preprint,
      { id: 'retracted', title: 'Ileal-lymphoid-nodular hyperplasia', year: 1998, ids: { doi: '10.1016/X' } },
      { id: 'fine', title: 'Fine paper', year: 2020, ids: { openalex: 'W5' } },
    ];
    const r = await checkPapers(papers, { http: h });
    expect(r.retracted).toEqual(['retracted']);
    expect(r.published[preprint.id]).toMatchObject({ venue: 'CVPR', ids: { doi: '10.1109/cvpr.2016.90' } });
    expect(r.checked).toEqual({ retraction: 3, preprints: 1, preprintTotal: 1 });
    expect(r.failed).toEqual([]);
    expect(calls.filter((c) => c.includes('is_retracted'))).toHaveLength(2); // one OpenAlex-id batch, one DOI batch
    expect(calls.find((c) => c.includes('search.title'))).toContain('type:!preprint');
  });

  it('reports a failed part and keeps the other', async () => {
    const { http: h } = http((url) => (url.includes('is_retracted') ? { results: [] } : null));
    const r = await checkPapers([preprint], { http: h });
    expect(r.failed).toEqual(['published']);
    expect(r.published).toEqual({});
  });

  it('validates the request', async () => {
    const app = createApp(loadConfig({}));
    const res = await app.request('/api/papers/check', { method: 'POST', body: JSON.stringify({ papers: [] }), headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(400);
  });
});
