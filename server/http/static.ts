import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';

/**
 * What the built app may load: only its own files, plus images from paper
 * data (https) and the data:/blob: URLs used by image export. Style attributes
 * need 'unsafe-inline' (React sets them); scripts do not.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Whether `dir` holds a built app (production mode, DESIGN 15.2). */
export function hasBuiltApp(dir: string): boolean {
  // An empty dir would point at the project root and its development index.html.
  return dir.trim() !== '' && existsSync(join(dir, 'index.html')) && existsSync(join(dir, 'assets'));
}

/**
 * Serve the built app from `dir` next to the API: files as they are, any other
 * GET outside /api/ gets index.html (the app routes on the client).
 */
export function mountStaticApp(app: Hono, dir: string): void {
  app.use('*', async (c, next) => {
    await next();
    if ((c.res.headers.get('content-type') ?? '').includes('text/html')) {
      c.res.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    }
  });
  app.get('*', async (c, next) => (c.req.path.startsWith('/api/') ? next() : serveStatic({ root: dir })(c, next)));
  app.get('*', async (c, next) => (c.req.path.startsWith('/api/') ? next() : serveStatic({ root: dir, path: 'index.html' })(c, next)));
}
