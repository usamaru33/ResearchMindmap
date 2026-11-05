import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { CONTENT_SECURITY_POLICY, buildContentSecurityPolicy } from '../http/static';
import type { HealthResponse } from '../../shared/types';

function builtApp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rmm-dist-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Research Mind Map</title><div id="root"></div>');
  return dir;
}

const get = (app: ReturnType<typeof createApp>, path: string) => app.request(`http://localhost:8787${path}`);

describe('Google sync is off without GOOGLE_CLIENT_ID', () => {
  const app = createApp(loadConfig({ STATIC_DIR: builtApp() }));

  it('says so in /api/health and changes nothing else', async () => {
    const body = (await (await get(app, '/api/health')).json()) as HealthResponse;
    expect(body.googleSync).toEqual({ enabled: false, clientId: null });
    const page = await get(app, '/');
    expect(page.headers.get('content-security-policy')).toBe(CONTENT_SECURITY_POLICY);
    expect(page.headers.get('content-security-policy')).not.toContain('google');
    expect(page.headers.get('cross-origin-opener-policy')).toBe('same-origin');
  });

  it('treats a blank client ID as unset', async () => {
    const blank = createApp(loadConfig({ GOOGLE_CLIENT_ID: '  ', STATIC_DIR: builtApp() }));
    const body = (await (await get(blank, '/api/health')).json()) as HealthResponse;
    expect(body.googleSync.enabled).toBe(false);
  });
});

describe('Google sync with a client ID', () => {
  const app = createApp(loadConfig({ GOOGLE_CLIENT_ID: '123-abc.apps.googleusercontent.com', STATIC_DIR: builtApp() }));

  it('hands the public client ID to the page', async () => {
    const body = (await (await get(app, '/api/health')).json()) as HealthResponse;
    expect(body.googleSync).toEqual({ enabled: true, clientId: '123-abc.apps.googleusercontent.com' });
  });

  it('lets the page reach only the Google addresses it needs, and keep the sign-in popup', async () => {
    const page = await get(app, '/');
    const csp = page.headers.get('content-security-policy') ?? '';
    expect(csp).toBe(buildContentSecurityPolicy(true));
    expect(csp).toContain("script-src 'self' https://accounts.google.com/gsi/client");
    expect(csp).toContain("connect-src 'self' https://accounts.google.com/gsi/ https://www.googleapis.com");
    expect(csp).toContain('frame-src https://accounts.google.com/gsi/');
    // Everything else stays as strict as before.
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(page.headers.get('cross-origin-opener-policy')).toBe('same-origin-allow-popups');
  });
});
