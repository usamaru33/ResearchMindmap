import { existsSync } from 'node:fs';

export interface AppConfig {
  port: number;
  openalexApiKey?: string;
  semanticScholarApiKey?: string;
  ieeeApiKey?: string;
  ncbiApiKey?: string;
  crossrefMailto?: string;
  anthropicApiKey?: string;
  anthropicModel: string;
  cacheDir: string;
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
    openalexApiKey: optional(env.OPENALEX_API_KEY),
    semanticScholarApiKey: optional(env.SEMANTIC_SCHOLAR_API_KEY),
    ieeeApiKey: optional(env.IEEE_API_KEY),
    ncbiApiKey: optional(env.NCBI_API_KEY),
    crossrefMailto: optional(env.CROSSREF_MAILTO),
    anthropicApiKey: optional(env.ANTHROPIC_API_KEY),
    anthropicModel: optional(env.ANTHROPIC_MODEL) ?? 'claude-opus-5-5',
    cacheDir: optional(env.CACHE_DIR) ?? '.cache',
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
