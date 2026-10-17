import { Hono } from 'hono';
import { z } from 'zod';
import type { ResolveResponse } from '../../shared/types';
import { resolveIdentifier } from '../core/resolve';
import { readJson } from '../http/validate';
import type { Services } from '../services';

const ResolveBody = z.object({ inputs: z.array(z.string().max(500)).min(1).max(100) });

export function resolveRoutes(services: Services) {
  return new Hono().post('/', async (c) => {
    const { inputs } = await readJson(c, ResolveBody);
    const ctx = { http: services.http, apiKey: services.config.openalexApiKey, mailto: services.config.crossrefMailto };
    const lines = inputs.map((s) => s.trim()).filter(Boolean);
    // A few at a time: per-source rate limits apply anyway, this keeps memory flat.
    const items = [];
    for (let i = 0; i < lines.length; i += 5) {
      items.push(...(await Promise.all(lines.slice(i, i + 5).map((line) => resolveIdentifier(line, ctx)))));
    }
    const body: ResolveResponse = { items };
    return c.json(body);
  });
}
