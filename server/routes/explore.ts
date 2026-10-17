import { Hono } from 'hono';
import { z } from 'zod';
import type { ExploreSearchResponse, ExploreWorksResponse } from '../../shared/types';
import { entityWorks, isExploreId, searchEntities } from '../core/explore';
import { ApiHttpError } from '../http/errors';
import { readJson } from '../http/validate';
import type { Services } from '../services';

const Kind = z.enum(['author', 'venue']);

const SearchBody = z.object({
  kind: Kind,
  query: z.string().trim().min(2).max(200),
});

const WorksBody = z.object({
  kind: Kind,
  id: z.string().trim(),
  limit: z.number().int().min(1).max(200).default(50),
  sort: z.enum(['cited', 'recent']).default('cited'),
  yearMin: z.number().int().min(1000).max(3000).optional(),
  yearMax: z.number().int().min(1000).max(3000).optional(),
});

export function exploreRoutes(services: Services) {
  const ctx = () => ({ http: services.http, apiKey: services.config.openalexApiKey });
  return new Hono()
    .post('/search', async (c) => {
      const body = await readJson(c, SearchBody);
      const entities = await searchEntities(body.kind, body.query, ctx()).catch((err: Error) => {
        throw new ApiHttpError(502, 'upstream_error', `OpenAlex: ${err.message}`);
      });
      return c.json({ entities } satisfies ExploreSearchResponse);
    })
    .post('/works', async (c) => {
      const body = await readJson(c, WorksBody);
      if (!isExploreId(body.kind, body.id)) {
        throw new ApiHttpError(400, 'invalid_request', `OpenAlex の${body.kind === 'author' ? '著者' : '掲載先'} ID ではありません: ${body.id}`);
      }
      const result = await entityWorks(body.kind, body.id, body, ctx()).catch((err: Error) => {
        throw new ApiHttpError(502, 'upstream_error', `OpenAlex: ${err.message}`);
      });
      return c.json(result satisfies ExploreWorksResponse);
    });
}
