import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Hono } from 'hono';

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
// Loaded only when the app is served: importing it at startup kept `tsx watch`
// under `npm run dev` from ever starting the server.
let serveStaticModule: Promise<typeof import('@hono/node-server/serve-static')> | null = null;
const loadServeStatic = () => (serveStaticModule ??= import('@hono/node-server/serve-static'));

function addCspHeader(app: Hono): void {
  app.use('*', async (c, next) => {
    await next();
    if ((c.res.headers.get('content-type') ?? '').includes('text/html')) {
      c.res.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    }
  });
}

export function mountStaticApp(app: Hono, dir: string): void {
  addCspHeader(app);
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) return next();
    const { serveStatic } = await loadServeStatic();
    return serveStatic({ root: dir })(c, next);
  });
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) return next();
    const { serveStatic } = await loadServeStatic();
    return serveStatic({ root: dir, path: 'index.html' })(c, next);
  });
}

/** A built app held in memory: published path (e.g. "/assets/app.js") → file. */
export type EmbeddedFiles = Map<string, { body: Uint8Array; type: string }>;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf('.');
  return CONTENT_TYPES[dot >= 0 ? path.slice(dot).toLowerCase() : ''] ?? 'application/octet-stream';
}

/**
 * The desktop app (DESIGN 15.3) serves the build embedded in the executable,
 * so nothing is unpacked to disk where other programs could change it. Only
 * the listed files exist; any other GET outside /api/ gets index.html.
 */
export function mountEmbeddedApp(app: Hono, files: EmbeddedFiles): void {
  const index = files.get('/index.html');
  if (!index) throw new Error('embedded app has no index.html');
  addCspHeader(app);
  app.get('*', (c, next) => {
    if (c.req.path.startsWith('/api/')) return next();
    const file = files.get(c.req.path) ?? index;
    // Vite puts a content hash in every file name under /assets/.
    const cache = file !== index && c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    return c.body(file.body as Uint8Array<ArrayBuffer>, 200, { 'content-type': file.type, 'cache-control': cache });
  });
}
