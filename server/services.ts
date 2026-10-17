import type { AppConfig } from './config';
import { DiskCache, MemoryCache, NoCache, TieredCache, type Cache } from './infra/cache';
import { HttpClient } from './infra/http';
import { RateLimiter, defaultIntervals } from './infra/rateLimit';

export interface Services {
  config: AppConfig;
  http: HttpClient;
  cache: Cache;
}

export function createServices(config: AppConfig, overrides: Partial<Omit<Services, 'config'>> = {}): Services {
  const cache =
    overrides.cache ??
    (config.cacheTtlHours > 0 ? new TieredCache(new MemoryCache(500), new DiskCache(config.cacheDir)) : new NoCache());
  const limiter = new RateLimiter(
    defaultIntervals({ semanticScholar: !!config.semanticScholarApiKey, ncbi: !!config.ncbiApiKey }),
  );
  const http =
    overrides.http ?? new HttpClient({ cache, limiter, defaultTtlMs: config.cacheTtlHours * 3600 * 1000 });
  return { config, http, cache };
}
