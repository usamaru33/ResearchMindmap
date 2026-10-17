import { Hono } from 'hono';
import { z } from 'zod';
import { formatQuery, parseQuery } from '../../shared/query';
import type { QueryParseResponse } from '../../shared/types';
import { readJson } from '../http/validate';

const ParseBody = z.object({ query: z.string().max(4000) });

export const queryRoutes = new Hono().post('/parse', async (c) => {
  const { query } = await readJson(c, ParseBody);
  const result = parseQuery(query);
  const body: QueryParseResponse = result.ok
    ? { ok: true, query: result.query, canonical: formatQuery(result.query), errors: [], warnings: result.warnings }
    : { ok: false, errors: result.errors, warnings: [] };
  return c.json(body);
});
