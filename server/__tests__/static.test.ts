import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { CONTENT_SECURITY_POLICY, hasBuiltApp } from '../http/static';

function builtApp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rmm-dist-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Research Mind Map</title><div id="root"></div>');
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
  return dir;
}

describe('production mode (the API server serves the built app)', () => {
  const app = createApp(loadConfig({ STATIC_DIR: builtApp() }));
  const get = (path: string) => app.request(`http://localhost:8787${path}`);

  it('serves the app with a content security policy, and files as they are', async () => {
    const page = await get('/');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Research Mind Map');
    expect(page.headers.get('content-security-policy')).toBe(CONTENT_SECURITY_POLICY);
    expect(page.headers.get('content-security-policy')).toContain("script-src 'self'");
    const js = await get('/assets/app.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toContain('javascript');
  });

  it('answers other paths with the app, but not API paths', async () => {
    expect(await (await get('/some/client/route')).text()).toContain('id="root"');
    const api = await get('/api/nope');
    expect(api.status).toBe(404);
    expect(((await api.json()) as { error: { code: string } }).error.code).toBe('not_found');
    expect((await get('/api/health')).status).toBe(200);
  });

  it('does not serve files outside the build', async () => {
    const res = await get('/..%2f..%2fpackage.json');
    expect(await res.text()).not.toContain('"dependencies"');
  });

  it('stays API-only without a build, or with an empty directory', () => {
    expect(hasBuiltApp('')).toBe(false);
    expect(hasBuiltApp(join(tmpdir(), 'rmm-no-such-dir'))).toBe(false);
  });
});
