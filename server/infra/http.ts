import type { Cache } from './cache';
import { NoCache } from './cache';
import { RateLimiter, realSleep, type Sleep } from './rateLimit';

export class HttpError extends Error {
  readonly source: string;
  /** HTTP status, or 0 for network errors/timeouts. */
  readonly status: number;

  constructor(source: string, status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.source = source;
    this.status = status;
  }
}

export interface RequestOptions {
  headers?: Record<string, string>;
  /** Defaults to the URL with secrets removed. */
  cacheKey?: string;
  /** 0 disables caching for this request. */
  ttlMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Override the client's retry count for this request. */
  retries?: number;
}

export interface HttpResult<T> {
  data: T;
  cached: boolean;
}

export interface HttpClientOptions {
  fetch?: typeof fetch;
  cache?: Cache;
  limiter?: RateLimiter;
  sleep?: Sleep;
  maxRetries?: number;
  defaultTtlMs?: number;
  log?: (line: string) => void;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const SECRET_PARAMS = /^(api_?key|apikey|key|token|access_token)$/i;

/** Remove credentials from a URL so it can be logged or used as a cache key. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const name of [...u.searchParams.keys()]) {
      if (SECRET_PARAMS.test(name)) u.searchParams.delete(name);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function retryAfterMs(res: Response): number | undefined {
  const raw = res.headers.get('retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** Short, human-readable failure text (APIs often return long JSON or HTML bodies). */
export function describeFailure(source: string, status: number, body: string): string {
  if (status === 429) return `${source}: 回数制限に達しました（429）。しばらく待つか APIキーを設定してください`;
  if (status === 401 || status === 403) return `${source}: アクセスが拒否されました（${status}）。APIキーを確認してください`;
  let detail = '';
  try {
    const json = JSON.parse(body) as { message?: unknown; error?: unknown };
    const msg = json.message ?? json.error;
    detail = typeof msg === 'string' ? msg : '';
  } catch {
    detail = /<html/i.test(body) ? '' : body;
  }
  detail = detail.replace(/\s+/g, ' ').trim().slice(0, 120);
  return `${source}: HTTP ${status}${detail ? ` ${detail}` : ''}`;
}

export class HttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly cache: Cache;
  private readonly limiter: RateLimiter;
  private readonly sleep: Sleep;
  private readonly maxRetries: number;
  private readonly defaultTtlMs: number;
  private readonly log: (line: string) => void;

  constructor(opts: HttpClientOptions = {}) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.cache = opts.cache ?? new NoCache();
    this.limiter = opts.limiter ?? new RateLimiter({});
    this.sleep = opts.sleep ?? realSleep;
    this.maxRetries = opts.maxRetries ?? 3;
    this.defaultTtlMs = opts.defaultTtlMs ?? 72 * 3600 * 1000;
    this.log = opts.log ?? ((line) => console.log(line));
  }

  getJson<T>(source: string, url: string, opts: RequestOptions = {}): Promise<HttpResult<T>> {
    return this.request(source, url, opts, async (res) => {
      const type = res.headers.get('content-type') ?? '';
      const text = await res.text();
      if (!type.includes('json') && !/^\s*[[{]/.test(text)) {
        throw new HttpError(source, res.status, `${source}: JSON ではない応答（${type || 'content-type なし'}）`);
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new HttpError(source, res.status, `${source}: 応答の JSON を読み取れません`);
      }
    });
  }

  getText(source: string, url: string, opts: RequestOptions = {}): Promise<HttpResult<string>> {
    return this.request(source, url, opts, (res) => res.text());
  }

  private async request<T>(
    source: string,
    url: string,
    opts: RequestOptions,
    read: (res: Response) => Promise<T>,
  ): Promise<HttpResult<T>> {
    const ttl = opts.ttlMs ?? this.defaultTtlMs;
    const key = `${source}|${opts.cacheKey ?? redactUrl(url)}`;
    if (ttl > 0) {
      const hit = await this.cache.get<T>(key);
      if (hit !== undefined) {
        this.log(`[http] ${source} cache hit ${redactUrl(url).slice(0, 140)}`);
        return { data: hit, cached: true };
      }
    }

    let attempt = 0;
    for (;;) {
      const started = Date.now();
      try {
        const data = await this.limiter.schedule(source, async () => {
          const signals = [AbortSignal.timeout(opts.timeoutMs ?? 15_000)];
          if (opts.signal) signals.push(opts.signal);
          const res = await this.fetchImpl(url, {
            headers: { 'user-agent': 'ResearchMindMap/0.1 (+https://github.com/usamaru33/ResearchMindmap)', ...opts.headers },
            signal: AbortSignal.any(signals),
          });
          this.log(`[http] ${source} ${res.status} ${Date.now() - started}ms ${redactUrl(url).slice(0, 140)}`);
          if (!res.ok) {
            const body = await res.text().catch(() => '');
            const err = new HttpError(source, res.status, describeFailure(source, res.status, body));
            (err as HttpError & { retryAfter?: number }).retryAfter = retryAfterMs(res);
            throw err;
          }
          return read(res);
        });
        if (ttl > 0) await this.cache.set(key, data, ttl);
        return { data, cached: false };
      } catch (err) {
        if (opts.signal?.aborted) throw err;
        const status = err instanceof HttpError ? err.status : 0;
        const retryable = err instanceof HttpError ? RETRYABLE.has(status) : true;
        if (!retryable || attempt >= (opts.retries ?? this.maxRetries)) {
          if (err instanceof HttpError) throw err;
          const name = (err as Error).name;
          const message = name === 'TimeoutError' ? 'タイムアウトしました' : (err as Error).message;
          throw new HttpError(source, 0, `${source}: ${message}`);
        }
        const hinted = (err as { retryAfter?: number }).retryAfter;
        const backoff = Math.min(10_000, hinted ?? 500 * 2 ** attempt + Math.random() * 250);
        this.log(`[http] ${source} retry ${attempt + 1}/${opts.retries ?? this.maxRetries} in ${Math.round(backoff)}ms (${status || 'network'})`);
        await this.sleep(backoff);
        attempt++;
      }
    }
  }
}
