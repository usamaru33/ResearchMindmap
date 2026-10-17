import { Hono } from 'hono';
import { z } from 'zod';
import type { VagueSearchResponse } from '../../shared/types';
import { enrichWithOpenAlex } from '../core/enrich';
import { searchAll } from '../core/search';
import { vagueSearch } from '../core/vague';
import { readJson } from '../http/validate';
import { getLlm } from '../llm/client';
import type { Services } from '../services';
import { SOURCES } from '../sources/registry';
import { openAlexSemanticSearch, s2TextSearch } from '../sources/semantic';

const VagueBody = z.object({
  description: z.string().trim().min(5).max(4000),
  limit: z.number().int().min(5).max(100).default(40),
  useLlm: z.boolean().default(true),
  lang: z.enum(['ja', 'en']).default('ja'),
  yearMin: z.number().int().min(1800).max(2100).optional(),
  yearMax: z.number().int().min(1800).max(2100).optional(),
});

export function vagueRoutes(services: Services) {
  return new Hono().post('/', async (c) => {
    const started = Date.now();
    const body = await readJson(c, VagueBody);
    const ctx = { http: services.http, config: services.config };
    const outcome = await vagueSearch(
      body.description,
      { limit: body.limit, useLlm: body.useLlm, lang: body.lang, yearMin: body.yearMin, yearMax: body.yearMax },
      {
        llm: getLlm(services.config),
        semantic: (text, opts) => openAlexSemanticSearch(text, opts, ctx),
        s2: (text, opts) => s2TextSearch(text, opts, ctx),
        search: (query, opts) =>
          searchAll(query, opts, {
            ...ctx,
            adapters: SOURCES,
            enrich: async (papers) => ({ papers, enriched: 0 }),
          }),
        enrich: (papers) => enrichWithOpenAlex(papers, { http: services.http, apiKey: services.config.openalexApiKey }),
      },
    );
    const response: VagueSearchResponse = { ...outcome, tookMs: Date.now() - started };
    return c.json(response);
  });
}
