import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { queryTrends, trendUrl } from '../core/trends';
import { HttpClient } from '../infra/http';
import { createServices } from '../services';

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
        return new Response(JSON.stringify(body ?? { error: 'x' }), { status: body ? 200 : 500, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch,
    }),
  };
}

const groups = (pairs: Array<[number, number]>) => ({ group_by: pairs.map(([key, count]) => ({ key: String(key), count })) });

describe('trendUrl', () => {
  it('counts by year and narrows the range to the query', () => {
    const r = trendUrl('"body ownership" year:2018..', { yearMin: 2010, yearMax: 2024 });
    if ('error' in r) throw new Error(r.error);
    const url = decodeURIComponent(r.url).replace(/\+/g, ' ');
    expect(url).toContain('group_by=publication_year');
    expect(url).toContain('publication_year:2018-2024');
    expect(url).not.toContain('per-page');
    expect(url).not.toContain('select=');
    expect(r.approximate).toBe(false);
  });

  it('flags conditions OpenAlex cannot count and reports parse errors', () => {
    const r = trendUrl('robot*', { yearMin: 2020, yearMax: 2024 });
    expect('error' in r ? null : r.approximate).toBe(true);
    expect(trendUrl('(robot', { yearMin: 2020, yearMax: 2024 })).toHaveProperty('error');
  });
});

describe('queryTrends', () => {
  it('fills silent years, totals each series, and adds all works for shares', async () => {
    const { http: h, calls } = http((url) => {
      if (url.includes('search=')) return url.includes('drone') ? groups([[2021, 3], [2023, 5]]) : groups([[2022, 7]]);
      if (url.includes('group_by')) return groups([[2021, 100], [2022, 200], [2023, 300]]);
      return null;
    });
    const r = await queryTrends(['drone', 'robot', 'bad ('], { yearMin: 2021, yearMax: 2023, share: true }, { http: h });
    expect(r.series[0]).toMatchObject({ query: 'drone', total: 8, byYear: [{ year: 2021, count: 3 }, { year: 2022, count: 0 }, { year: 2023, count: 5 }] });
    expect(r.series[1].total).toBe(7);
    expect(r.series[2]).toMatchObject({ error: 'invalid_query', byYear: [] });
    expect(r.all?.map((y) => y.count)).toEqual([100, 200, 300]);
    expect(calls).toHaveLength(3);
  });

  it('keeps other series when one request fails', async () => {
    const { http: h } = http((url) => (url.includes('drone') ? null : groups([[2022, 1]])));
    const r = await queryTrends(['drone', 'robot'], { yearMin: 2022, yearMax: 2022, share: false }, { http: h });
    expect(r.series.map((s) => s.error ?? 'ok')).toEqual(['upstream', 'ok']);
    expect(r.all).toBeUndefined();
  });

  it('validates the request', async () => {
    const config = loadConfig({});
    const app = createApp(config, createServices(config, { http: http(() => groups([])).http }));
    const post = (body: unknown) => app.request('/api/trends', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
    expect((await post({ queries: [] })).status).toBe(400);
    expect((await post({ queries: ['a', 'b', 'c', 'd', 'e', 'f'] })).status).toBe(400);
    const ok = (await (await post({ queries: ['a'], yearMin: 2020, yearMax: 2022 })).json()) as { yearMin: number; series: unknown[] };
    expect(ok.yearMin).toBe(2020);
    expect(ok.series).toHaveLength(1);
  });
});
