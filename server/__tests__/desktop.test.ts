import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { sessionCookieName } from '../http/session';
import { CONTENT_SECURITY_POLICY, contentTypeFor, type EmbeddedFiles } from '../http/static';

const token = 'a'.repeat(64);
const file = (text: string, path: string) => ({ body: new TextEncoder().encode(text), type: contentTypeFor(path) });
const files: EmbeddedFiles = new Map([
  ['/index.html', file('<!doctype html><div id="root"></div>', '/index.html')],
  ['/assets/app-1234.js', file('console.log(1)', '/assets/app-1234.js')],
]);
const config = loadConfig({ STATIC_DIR: '' });
const app = createApp(config, undefined, { launchToken: token, embeddedApp: files });
const cookie = `${sessionCookieName(config.port)}=${token}`;
const get = (path: string, headers: Record<string, string> = {}) => app.request(`http://127.0.0.1:8787${path}`, { headers });

describe('desktop app: launch session', () => {
  it('refuses API calls without the cookie, or with another one', async () => {
    expect((await get('/api/health')).status).toBe(401);
    expect((await get('/api/health', { cookie: `${sessionCookieName(config.port)}=${'b'.repeat(64)}` })).status).toBe(401);
    expect((await get('/api/health', { cookie: `${sessionCookieName(9999)}=${token}` })).status).toBe(401);
    expect((await get('/api/health', { cookie })).status).toBe(200);
  });

  it('hands out an HttpOnly, SameSite=Strict cookie only for the right launch token', async () => {
    const res = await get(`/?launch=${token}`);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/');
    const set = res.headers.get('set-cookie') ?? '';
    expect(set).toContain(cookie);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Strict/i);
    const wrong = await get('/?launch=nope');
    expect(wrong.status).toBe(403);
    expect(wrong.headers.get('set-cookie')).toBeNull();
  });

  it('still applies the host and origin checks', async () => {
    expect((await get('/api/health', { cookie, host: 'evil.example' })).status).toBe(403);
    expect((await get('/api/health', { cookie, origin: 'https://evil.example' })).status).toBe(403);
  });
});

describe('desktop app: embedded build', () => {
  it('serves embedded files, and index.html with a CSP for anything else', async () => {
    const js = await get('/assets/app-1234.js');
    expect(js.headers.get('content-type')).toContain('javascript');
    expect(js.headers.get('cache-control')).toContain('immutable');
    for (const path of ['/', '/some/route', '/..%2f..%2fpackage.json', '/assets/missing.js']) {
      const page = await get(path);
      expect(await page.text()).toContain('id="root"');
      expect(page.headers.get('content-security-policy')).toBe(CONTENT_SECURITY_POLICY);
      expect(page.headers.get('cache-control')).toBe('no-cache');
    }
  });

  it('keeps API paths out of the app fallback', async () => {
    const res = await get('/api/nope', { cookie });
    expect(res.status).toBe(404);
  });
});
