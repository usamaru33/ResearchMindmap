import { Hono } from 'hono';
import { z } from 'zod';
import type { ExpandResponse, Paper } from '../../shared/types';
import { expandPaper } from '../core/expand';
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

export function paperRoutes(services: Services) {
  return new Hono().post('/expand', async (c) => {
    const body = await readJson(c, ExpandBody);
    const result = await expandPaper(body.paper as unknown as Paper, body.kind, body.limit, {
      http: services.http,
      apiKey: services.config.openalexApiKey,
    });
    const response: ExpandResponse = { kind: body.kind, ...result };
    return c.json(response);
  });
}
