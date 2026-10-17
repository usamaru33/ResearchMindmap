import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import type { QueryParseResponse } from '../../shared/types';

const app = createApp(loadConfig({}));
const post = (body: unknown) =>
  app.request('/api/query/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('POST /api/query/parse', () => {
  it('returns the parsed query and canonical text', async () => {
    const res = await post({ query: 'TI=(vr OR ar) PY=2020-2022' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as QueryParseResponse;
    expect(body.ok).toBe(true);
    expect(body.canonical).toBe('(title:vr OR title:ar) AND year:2020..2022');
    expect(body.query?.filters.yearMin).toBe(2020);
  });

  it('returns positioned errors for bad syntax', async () => {
    const body = (await (await post({ query: '(vr OR' })).json()) as QueryParseResponse;
    expect(body.ok).toBe(false);
    expect(body.errors[0]).toMatchObject({ start: 4, end: 6 });
  });

  it('rejects invalid bodies with 400', async () => {
    expect((await post({ q: 1 })).status).toBe(400);
    const res = await post('not json');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_json' } });
  });
});
