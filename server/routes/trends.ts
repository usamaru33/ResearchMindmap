import { Hono } from 'hono';
import { z } from 'zod';
import type { TrendsResponse } from '../../shared/types';
import { queryTrends } from '../core/trends';
import { readJson } from '../http/validate';
import type { Services } from '../services';

const thisYear = () => new Date().getFullYear();

const TrendsBody = z
  .object({
    queries: z.array(z.string().trim().min(1).max(1000)).min(1).max(5),
    yearMin: z.number().int().min(1900).optional(),
    yearMax: z.number().int().max(2100).optional(),
    share: z.boolean().default(true),
  })
  .transform((b) => {
    const yearMax = Math.min(b.yearMax ?? thisYear(), thisYear());
    const yearMin = Math.min(b.yearMin ?? yearMax - 19, yearMax);
    return { ...b, yearMin, yearMax };
  });

export function trendRoutes(services: Services) {
  return new Hono().post('/', async (c) => {
    const body = await readJson(c, TrendsBody);
    const result = await queryTrends(body.queries, body, { http: services.http, apiKey: services.config.openalexApiKey });
    return c.json(result satisfies TrendsResponse);
  });
}
