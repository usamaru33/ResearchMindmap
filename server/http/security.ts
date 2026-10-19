import type { MiddlewareHandler } from 'hono';

/** Host names that always reach the API: the machine itself. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export interface SecurityOptions {
  /** Extra host names allowed in the Host header (e.g. a LAN name when HOST is not loopback). "*" allows any. */
  allowedHosts: string[];
  /** Extra page origins allowed to call the API (e.g. "https://my-proxy.example"). */
  allowedOrigins: string[];
}

function hostnameOf(hostHeader: string): string {
  // "[::1]:8787" → "[::1]", "localhost:5173" → "localhost"
  const m = hostHeader.trim().toLowerCase().match(/^(\[[^\]]+\]|[^:]+)(?::\d+)?$/);
  return m ? m[1] : '';
}

function originAllowed(origin: string, extra: string[]): boolean {
  if (extra.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Keep the API for the user's own browser (DESIGN 9). The API spends the
 * user's API keys, so:
 * - the Host header must name this machine (stops DNS-rebinding pages),
 * - a page from another origin may not call it (stops CSRF from websites),
 * - write requests must be JSON, which a cross-site page cannot send without
 *   a CORS preflight, and the API answers no preflight.
 */
export function localOnly(opts: SecurityOptions): MiddlewareHandler {
  const hosts = new Set([...LOOPBACK, ...opts.allowedHosts.map((h) => h.toLowerCase())]);
  const anyHost = hosts.has('*');
  return async (c, next) => {
    // The request URL is built from the Host header by the Node adapter.
    const host = hostnameOf(c.req.header('host') ?? new URL(c.req.url).host);
    if (!anyHost && !hosts.has(host)) {
      return c.json({ error: { code: 'forbidden_host', message: 'This API only answers requests addressed to this machine (see ALLOWED_HOSTS).' } }, 403);
    }
    const origin = c.req.header('origin');
    if (c.req.header('sec-fetch-site') === 'cross-site' || (origin !== undefined && !originAllowed(origin, opts.allowedOrigins))) {
      return c.json({ error: { code: 'forbidden_origin', message: 'Requests from other websites are not allowed (see ALLOWED_ORIGINS).' } }, 403);
    }
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 405);
    }
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return c.json({ error: { code: 'unsupported_media_type', message: 'Send the request body as application/json.' } }, 415);
    }
    await next();
  };
}

/** Comma-separated list from an environment variable. */
export function listFromEnv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
