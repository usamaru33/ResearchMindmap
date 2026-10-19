import { existsSync } from 'node:fs';
import { listFromEnv } from './http/security';

export interface AppConfig {
  port: number;
  /** Interface to listen on; loopback by default so other machines cannot spend the API keys. */
  host: string;
  allowedHosts: string[];
  allowedOrigins: string[];
  openalexApiKey?: string;
  semanticScholarApiKey?: string;
  ieeeApiKey?: string;
  ncbiApiKey?: string;
  crossrefMailto?: string;
  anthropicApiKey?: string;
  anthropicModel: string;
  cacheDir: string;
  /** Built app served next to the API when it exists (production mode). */
  staticDir: string;
  cacheTtlHours: number;
  enableDblp: boolean;
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 8787),
    host: optional(env.HOST) ?? '127.0.0.1',
    allowedHosts: listFromEnv(env.ALLOWED_HOSTS),
    allowedOrigins: listFromEnv(env.ALLOWED_ORIGINS),
    openalexApiKey: optional(env.OPENALEX_API_KEY),
    semanticScholarApiKey: optional(env.SEMANTIC_SCHOLAR_API_KEY),
    ieeeApiKey: optional(env.IEEE_API_KEY),
    ncbiApiKey: optional(env.NCBI_API_KEY),
    crossrefMailto: optional(env.CROSSREF_MAILTO),
    anthropicApiKey: optional(env.ANTHROPIC_API_KEY),
    anthropicModel: optional(env.ANTHROPIC_MODEL) ?? 'claude-opus-5-5',
    cacheDir: optional(env.CACHE_DIR) ?? '.cache',
    staticDir: optional(env.STATIC_DIR) ?? 'dist',
    cacheTtlHours: Number(env.CACHE_TTL_HOURS ?? 72),
    enableDblp: env.ENABLE_DBLP === 'true',
  };
}

/** Load `.env` into process.env if present (Node 22 built-in, no dotenv dependency). */
export function loadDotEnv(path = '.env'): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}
