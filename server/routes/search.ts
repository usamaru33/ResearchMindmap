import { Hono } from 'hono';
import { z } from 'zod';
import { formatQuery, parseQuery } from '../../shared/query';
import type { SearchResponse, SourceName } from '../../shared/types';
import { enrichWithOpenAlex } from '../core/enrich';
import { searchAll } from '../core/search';
import { ApiHttpError } from '../http/errors';
import { readJson } from '../http/validate';
import type { Services } from '../services';
import { SOURCES } from '../sources/registry';

const SOURCE_NAMES = SOURCES.map((s) => s.name) as [SourceName, ...SourceName[]];

const SearchBody = z.object({
  query: z.string().min(1).max(4000),
  sources: z.array(z.enum(SOURCE_NAMES)).min(1).optional(),
  limitPerSource: z.number().int().min(1).max(50).default(25),
  limit: z.number().int().min(1).max(200).default(60),
  enrich: z.boolean().default(true),
});

export function searchRoutes(services: Services) {
  return new Hono().post('/', async (c) => {
    const started = Date.now();
    const body = await readJson(c, SearchBody);
    const parsed = parseQuery(body.query);
    if (!parsed.ok) {
      throw new ApiHttpError(400, 'invalid_query', parsed.errors[0].message, parsed.errors);
    }
    const outcome = await searchAll(
      parsed.query,
      { sources: body.sources, limitPerSource: body.limitPerSource, limit: body.limit, enrich: body.enrich },
      {
        http: services.http,
        config: services.config,
        adapters: SOURCES,
        enrich: (papers) =>
          enrichWithOpenAlex(papers, { http: services.http, apiKey: services.config.openalexApiKey }),
      },
    );
    const response: SearchResponse = {
      ...outcome,
      warnings: [...parsed.warnings.map((w) => w.message), ...outcome.warnings],
      query: parsed.query,
      canonical: formatQuery(parsed.query),
      tookMs: Date.now() - started,
    };
    return c.json(response);
  });
}
