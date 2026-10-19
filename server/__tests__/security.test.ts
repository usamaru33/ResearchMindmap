import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';

const json = { 'content-type': 'application/json' };
const body = JSON.stringify({ query: 'title:vr' });

function app(env: NodeJS.ProcessEnv = {}) {
  return createApp(loadConfig(env));
}

describe('API access from outside this machine', () => {
  it('listens on loopback unless HOST says otherwise', () => {
    expect(loadConfig({}).host).toBe('127.0.0.1');
    expect(loadConfig({ HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
  });

  it('serves the app on localhost, directly or through the dev proxy', async () => {
    const direct = await app().request('http://localhost:8787/api/query/parse', { method: 'POST', headers: json, body });
    expect(direct.status).toBe(200);
    const proxied = await app().request('http://localhost:8787/api/query/parse', {
      method: 'POST',
      headers: { ...json, host: 'localhost:5173', origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' },
      body,
    });
    expect(proxied.status).toBe(200);
    expect((await app().request('http://[::1]:8787/api/health')).status).toBe(200);
  });

  it('rejects other host names (DNS rebinding)', async () => {
    const res = await app().request('http://evil.example:8787/api/health');
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('forbidden_host');
    expect((await app({ ALLOWED_HOSTS: 'evil.example' }).request('http://evil.example:8787/api/health')).status).toBe(200);
  });

  it('rejects calls from other websites (CSRF)', async () => {
    const fromSite = await app().request('http://localhost:8787/api/query/parse', {
      method: 'POST',
      headers: { ...json, origin: 'https://evil.example' },
      body,
    });
    expect(fromSite.status).toBe(403);
    const crossSite = await app().request('http://localhost:8787/api/health', { headers: { 'sec-fetch-site': 'cross-site' } });
    expect(crossSite.status).toBe(403);
    const sandboxed = await app().request('http://localhost:8787/api/query/parse', { method: 'POST', headers: { ...json, origin: 'null' }, body });
    expect(sandboxed.status).toBe(403);
    const allowed = await app({ ALLOWED_ORIGINS: 'https://evil.example' }).request('http://localhost:8787/api/query/parse', {
      method: 'POST',
      headers: { ...json, origin: 'https://evil.example' },
      body,
    });
    expect(allowed.status).toBe(200);
  });

  it('only takes JSON bodies, so a form or text/plain post cannot reach it', async () => {
    const form = await app().request('http://localhost:8787/api/query/parse', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body,
    });
    expect(form.status).toBe(415);
    expect((await app().request('http://localhost:8787/api/query/parse', { method: 'OPTIONS' })).status).toBe(405);
  });

  it('limits the body size and sets security headers', async () => {
    const big = await app().request('http://localhost:8787/api/query/parse', {
      method: 'POST',
      headers: { ...json, 'content-length': String(9 * 1024 * 1024) },
      body: 'x'.repeat(9 * 1024 * 1024),
    });
    expect(big.status).toBe(413);
    const res = await app().request('http://localhost:8787/api/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
