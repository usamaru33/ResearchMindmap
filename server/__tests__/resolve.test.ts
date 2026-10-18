import { describe, expect, it } from 'vitest';
import { parseIdentifier, resolveIdentifier, similarity } from '../core/resolve';
import { HttpClient } from '../infra/http';

describe('parseIdentifier', () => {
  it.each([
    ['10.1145/3313831.3376358', { kind: 'doi', value: '10.1145/3313831.3376358' }],
    ['https://doi.org/10.1109/CVPR.2016.90', { kind: 'doi', value: '10.1109/cvpr.2016.90' }],
    ['https://doi.org/10.48550/arXiv.1706.03762', { kind: 'arxiv', value: '1706.03762' }],
    ['https://arxiv.org/abs/1706.03762v7', { kind: 'arxiv', value: '1706.03762' }],
    ['arXiv:2101.00001', { kind: 'arxiv', value: '2101.00001' }],
    ['2101.00001', { kind: 'arxiv', value: '2101.00001' }],
    ['https://openalex.org/W2626778328', { kind: 'openalex', value: 'W2626778328' }],
    ['https://pubmed.ncbi.nlm.nih.gov/29790452/', { kind: 'pmid', value: '29790452' }],
    ['PMID: 29790452', { kind: 'pmid', value: '29790452' }],
    ['- Attention Is All You Need', { kind: 'title', value: 'Attention Is All You Need' }],
    ['[3] Deep Residual Learning for Image Recognition', { kind: 'title', value: 'Deep Residual Learning for Image Recognition' }],
  ])('%s', (input, expected) => expect(parseIdentifier(input)).toEqual(expected));

  it('rejects empty or too short lines', () => {
    expect(parseIdentifier('  ')).toBeNull();
    expect(parseIdentifier('abc')).toBeNull();
  });
});

describe('similarity', () => {
  it('compares token sets', () => {
    expect(similarity('a b c', 'a b c')).toBe(1);
    expect(similarity('a b c d', 'a b c')).toBe(0.75);
  });
});

function http(routes: Array<[RegExp, number, unknown]>) {
  const calls: string[] = [];
  return {
    calls,
    http: new HttpClient({
      log: () => {},
      sleep: async () => {},
      fetch: (async (input: string | URL | Request) => {
        const url = decodeURIComponent(String(input));
        calls.push(url);
        const hit = routes.find(([re]) => re.test(url));
        const [, status, body] = hit ?? [null, 404, { error: 'nf' }];
        return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
          status,
          headers: { 'content-type': typeof body === 'string' ? 'application/atom+xml' : 'application/json' },
        });
      }) as typeof fetch,
    }),
  };
}

describe('resolveIdentifier', () => {
  it('falls back to Crossref when OpenAlex does not know a DOI', async () => {
    const { http: h, calls } = http([
      [/api\.crossref\.org\/works\/10\.1234\/x/, 200, { message: { DOI: '10.1234/X', title: ['From Crossref'], issued: { 'date-parts': [[2021]] } } }],
    ]);
    const r = await resolveIdentifier('10.1234/x', { http: h });
    expect(r).toMatchObject({ ok: true, kind: 'doi', paper: { title: 'From Crossref', year: 2021 } });
    expect(calls[0]).toContain('api.openalex.org/works/doi:10.1234/x');
  });

  it('keeps the requested arXiv id even when OpenAlex reports another DOI', async () => {
    const { http: h } = http([
      [/works\/doi:10\.48550\/arxiv\.1706\.03762/, 200, { id: 'https://openalex.org/W1', doi: 'https://doi.org/10.65215/odd', title: 'Attention Is All You Need' }],
    ]);
    const r = await resolveIdentifier('https://arxiv.org/abs/1706.03762', { http: h });
    expect(r.paper?.ids).toMatchObject({ arxiv: '1706.03762', doi: '10.65215/odd' });
  });

  it('prefers arXiv when OpenAlex files the arXiv DOI under another title', async () => {
    const feed = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/1810.04805v2</id><title>BERT: Pre-training of Deep Bidirectional Transformers</title><published>2018-10-11T00:00:00Z</published><author><name>Jacob Devlin</name></author><summary>x</summary></entry></feed>';
    const { http: h } = http([
      [/works\/doi:10\.48550\/arxiv\.1810\.04805/, 200, { id: 'https://openalex.org/W2896457183', doi: 'https://doi.org/10.4230/lipics.x', title: 'AI-Assisted Pipeline for Dynamic Generation' }],
      [/export\.arxiv\.org/, 200, feed],
    ]);
    const r = await resolveIdentifier('https://arxiv.org/abs/1810.04805', { http: h });
    expect(r.paper?.title).toBe('BERT: Pre-training of Deep Bidirectional Transformers');
  });

  it('picks the most cited exact-title match', async () => {
    const work = (id: string, title: string, cites: number) => ({ id: `https://openalex.org/${id}`, title, cited_by_count: cites, publication_year: 2017 });
    const { http: h } = http([
      [/search\.title=/, 200, { results: [work('W1', 'Attention Is All You Need', 3), work('W2', 'Attention Is All You Need', 90000), work('W3', 'Attention is all you need in speech', 50)] }],
    ]);
    const r = await resolveIdentifier('Attention Is All You Need', { http: h });
    expect(r.paper?.ids?.openalex).toBe('W2');
  });

  it('reports lines it cannot resolve', async () => {
    const { http: h } = http([[/search\.title=/, 200, { results: [] }]]);
    expect(await resolveIdentifier('A title nobody ever wrote down', { http: h })).toMatchObject({ ok: false, error: '見つかりませんでした' });
    expect(await resolveIdentifier('abc', { http: h })).toMatchObject({ ok: false });
  });
});
