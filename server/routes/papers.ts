import { Hono } from 'hono';
import { z } from 'zod';
import type { CheckResponse, ExpandResponse, MissingResponse, Paper, RecommendResponse } from '../../shared/types';
import { checkPapers } from '../core/check';
import { expandPaper } from '../core/expand';
import { findMissingPapers } from '../core/missing';
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

const MissingBody = z.object({
  papers: z
    .array(
      z.object({
        id: z.string(),
        ids: z.object({ doi: z.string().optional(), openalex: z.string().optional(), arxiv: z.string().optional() }).partial().optional(),
      }),
    )
    .min(1)
    .max(300),
  limit: z.number().int().min(1).max(60).default(40),
});

const CheckBody = z.object({
  papers: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        year: z.number().int().default(0),
        venue: z.string().optional(),
        type: z.string().optional(),
        authors: z.array(z.string()).max(50).optional(),
        ids: z.object({ doi: z.string().optional(), openalex: z.string().optional(), arxiv: z.string().optional() }).partial().optional(),
      }),
    )
    .min(1)
    .max(300),
});

export function paperRoutes(services: Services) {
  return new Hono()
    .post('/check', async (c) => {
      const body = await readJson(c, CheckBody);
      const result = await checkPapers(body.papers, { http: services.http, apiKey: services.config.openalexApiKey });
      return c.json(result satisfies CheckResponse);
    })
    .post('/missing', async (c) => {
      const body = await readJson(c, MissingBody);
      const result = await findMissingPapers(body.papers, body.limit, {
        http: services.http,
        apiKey: services.config.openalexApiKey,
      }).catch((err: Error) => {
        throw new ApiHttpError(502, 'upstream_error', `OpenAlex: ${err.message}`);
      });
      return c.json(result satisfies MissingResponse);
    })
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
