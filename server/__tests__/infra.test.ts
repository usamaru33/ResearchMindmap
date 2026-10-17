import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DiskCache, MemoryCache, TieredCache } from '../infra/cache';
import { HttpClient, HttpError, redactUrl } from '../infra/http';
import { RateLimiter } from '../infra/rateLimit';

describe('MemoryCache', () => {
  it('expires entries and evicts least recently used', async () => {
    let now = 0;
    const cache = new MemoryCache(2, () => now);
    await cache.set('a', 1, 100);
    await cache.set('b', 2, 100);
    await cache.get('a'); // a is now most recent
    await cache.set('c', 3, 100);
    expect(await cache.get('b')).toBeUndefined();
    expect(await cache.get('a')).toBe(1);
    now = 200;
    expect(await cache.get('a')).toBeUndefined();
  });
});

describe('DiskCache', () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('persists values across instances and honours TTL', async () => {
    dir = await mkdtemp(join(tmpdir(), 'rmm-cache-'));
    let now = 1000;
    await new DiskCache(dir, () => now).set('k', { v: 1 }, 50);
    expect(await new DiskCache(dir, () => now).get('k')).toEqual({ v: 1 });
    now = 2000;
    expect(await new DiskCache(dir, () => now).get('k')).toBeUndefined();
  });

  it('promotes disk hits into memory in a tiered cache', async () => {
    dir = await mkdtemp(join(tmpdir(), 'rmm-cache-'));
    await new DiskCache(dir).set('k', 'v', 60_000);
    const memory = new MemoryCache();
    const tiered = new TieredCache(memory, new DiskCache(dir));
    expect(await tiered.get('k')).toBe('v');
    expect(await memory.get('k')).toBe('v');
  });
});

describe('RateLimiter', () => {
  it('spaces requests for the same key and runs them one at a time', async () => {
    let now = 0;
    const slept: number[] = [];
    const limiter = new RateLimiter(
      { arxiv: 3000 },
      async (ms) => {
        slept.push(ms);
        now += ms;
      },
      () => now,
    );
    const order: string[] = [];
    await Promise.all(
      ['a', 'b', 'c'].map((name) =>
        limiter.schedule('arxiv', async () => {
          order.push(`${name}@${now}`);
        }),
      ),
    );
    expect(order).toEqual(['a@0', 'b@3000', 'c@6000']);
    expect(slept).toEqual([3000, 3000]);
  });

  it('does not delay unknown keys', async () => {
    const limiter = new RateLimiter({}, async () => {
      throw new Error('should not sleep');
    });
    expect(await limiter.schedule('x', async () => 42)).toBe(42);
  });
});

function fakeFetch(responses: Array<() => Response>) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    calls.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    return next();
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('HttpClient', () => {
  const quiet = { log: () => {}, sleep: async () => {} };

  it('retries 429/5xx and honours Retry-After', async () => {
    const slept: number[] = [];
    const { impl, calls } = fakeFetch([
      json({}, 429, { 'retry-after': '2' }),
      json({}, 503),
      json({ ok: true }),
    ]);
    const http = new HttpClient({ ...quiet, fetch: impl, sleep: async (ms) => void slept.push(ms) });
    const res = await http.getJson<{ ok: boolean }>('s2', 'https://api.example/x');
    expect(res).toEqual({ data: { ok: true }, cached: false });
    expect(calls).toHaveLength(3);
    expect(slept[0]).toBe(2000);
  });

  it('does not retry other 4xx errors', async () => {
    const { impl, calls } = fakeFetch([json({ error: 'nope' }, 404)]);
    const http = new HttpClient({ ...quiet, fetch: impl });
    await expect(http.getJson('openalex', 'https://api.example/x')).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
      source: 'openalex',
    });
    expect(calls).toHaveLength(1);
  });

  it('gives up after maxRetries on network errors', async () => {
    const failing = () => {
      throw new TypeError('fetch failed');
    };
    const { impl, calls } = fakeFetch([failing, failing, failing]);
    const http = new HttpClient({ ...quiet, fetch: impl, maxRetries: 2 });
    await expect(http.getJson('arxiv', 'https://api.example/x')).rejects.toBeInstanceOf(HttpError);
    expect(calls).toHaveLength(3);
  });

  it('rejects non-JSON bodies (e.g. bot-check pages)', async () => {
    const { impl } = fakeFetch([() => new Response('<html>bot check</html>', { headers: { 'content-type': 'text/html' } })]);
    const http = new HttpClient({ ...quiet, fetch: impl });
    await expect(http.getJson('dblp', 'https://dblp.example/x')).rejects.toThrow(/JSON ではない/);
  });

  it('caches responses under a key without secrets', async () => {
    const { impl, calls } = fakeFetch([json({ n: 1 })]);
    const http = new HttpClient({ ...quiet, fetch: impl, cache: new MemoryCache() });
    await http.getJson('openalex', 'https://api.example/x?q=1&api_key=SECRET');
    const second = await http.getJson('openalex', 'https://api.example/x?q=1&api_key=OTHER');
    expect(second).toEqual({ data: { n: 1 }, cached: true });
    expect(calls).toHaveLength(1);
  });

  it('redacts credentials from URLs', () => {
    expect(redactUrl('https://x.org/a?q=1&api_key=s&apikey=t&key=u')).toBe('https://x.org/a?q=1');
  });
});
