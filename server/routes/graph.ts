import { Hono } from 'hono';
import { z } from 'zod';
import type { GraphBuildResponse, Paper } from '../../shared/types';
import { enrichWithOpenAlex } from '../core/enrich';
import { clusterPapers, linkCitations } from '../core/graph';
import { readJson } from '../http/validate';
import type { Services } from '../services';

// Papers come from our own search results; validate only what the graph needs.
const PaperShape = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    references: z.array(z.string()).default([]),
  })
  .passthrough();

const GraphBody = z.object({
  papers: z.array(PaperShape).min(1).max(300),
  clusterLevel: z.enum(['auto', 'topic', 'subfield', 'field', 'domain', 'keyword']).default('auto'),
});

export function graphRoutes(services: Services) {
  return new Hono().post('/build', async (c) => {
    const body = await readJson(c, GraphBody);
    const warnings: string[] = [];
    // Search results are usually enriched already; this fills papers added another way.
    const enrich = await enrichWithOpenAlex(body.papers as unknown as Paper[], {
      http: services.http,
      apiKey: services.config.openalexApiKey,
    });
    if (enrich.error) warnings.push(`OpenAlex での補完に失敗しました: ${enrich.error}`);
    const { papers, links } = linkCitations(enrich.papers);
    const clusters = clusterPapers(papers, { level: body.clusterLevel });
    const response: GraphBuildResponse = { papers, citationLinks: links, clusters, enriched: enrich.enriched, warnings };
    return c.json(response);
  });
}
