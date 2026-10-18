import { Hono } from 'hono';
import { z } from 'zod';
import type { ExpandResponse, Paper, RecommendResponse } from '../../shared/types';
import { expandPaper } from '../core/expand';
import { recommendPapers } from '../core/recommend';
import { ApiHttpError } from '../http/errors';
import { readJson } from '../http/validate';
import type { Services } from '../services';

const ExpandBody = z.object({
  paper: z
    .object({
      id: z.string(),
      title: z.string(),
      ids: z.record(z.string(), z.string().optional()).optional(),
      referenceIds: z.array(z.string()).optional(),
    })
    .passthrough(),
  kind: z.enum(['references', 'citations', 'related']),
  limit: z.number().int().min(1).max(200).default(50),
});

const RecommendBody = z.object({
  seeds: z
    .array(
      z.object({
        id: z.string(),
        ids: z.object({ doi: z.string().optional(), openalex: z.string().optional(), arxiv: z.string().optional() }).partial().optional(),
      }),
    )
    .min(1)
    .max(100),
  /** OpenAlex ids already on the map. */
  exclude: z.array(z.string()).max(2000).default([]),
  limit: z.number().int().min(1).max(100).default(30),
});

export function paperRoutes(services: Services) {
  return new Hono()
    .post('/recommend', async (c) => {
      const body = await readJson(c, RecommendBody);
      const result = await recommendPapers(body.seeds, body.exclude, body.limit, {
        http: services.http,
        apiKey: services.config.openalexApiKey,
      }).catch((err: Error) => {
        throw new ApiHttpError(502, 'upstream_error', `OpenAlex: ${err.message}`);
      });
      return c.json(result satisfies RecommendResponse);
    })
    .post('/expand', async (c) => {
    const body = await readJson(c, ExpandBody);
    const result = await expandPaper(body.paper as unknown as Paper, body.kind, body.limit, {
      http: services.http,
      apiKey: services.config.openalexApiKey,
    });
    const response: ExpandResponse = { kind: body.kind, ...result };
    return c.json(response);
  });
}
