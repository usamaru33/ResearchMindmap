import { Hono } from 'hono';
import { z } from 'zod';
import type { Paper } from '../../shared/types';
import type { AspectFillResponse, ClusterNamesResponse, GapsResponse } from '../../shared/types';
import { canFillWithoutLlm, fillByCue } from '../core/aspects';
import { cleanGaps, collectStatedGaps } from '../core/gaps';
import { papersBlock, templateDraft } from '../core/relatedWork';
import { AspectValues, ClusterNames, ResearchGaps } from '../llm/schemas';
import { extractiveSummary } from '../core/summarize';
import { ApiHttpError } from '../http/errors';
import { streamText } from '../http/sse';
import { readJson } from '../http/validate';
import { LlmError, getLlm } from '../llm/client';
import {
  ASPECT_SYSTEM,
  CLUSTER_NAMES_SYSTEM,
  aspectUser,
  GAPS_SYSTEM,
  SUMMARY_SYSTEM,
  clusterNamesUser,
  gapsUser,
  TRANSLATE_SYSTEM,
  relatedWorkSystem,
  relatedWorkUser,
  summaryUser,
  translateUser,
} from '../llm/prompts';
import type { Services } from '../services';

export const PaperInput = z
  .object({
    id: z.string(),
    title: z.string(),
    abstract: z.string().default(''),
    year: z.number().default(0),
    venue: z.string().default(''),
    authors: z.array(z.string()).default([]),
  })
  .passthrough();

const PaperBody = z.object({ paper: PaperInput, lang: z.enum(['ja', 'en']).default('ja'), useLlm: z.boolean().default(true) });

const GapsBody = z.object({
  papers: z.array(PaperInput).min(1).max(80),
  groups: z.array(z.object({ label: z.string().max(200), paperIds: z.array(z.string()) })).default([]),
  topic: z.string().max(2000).default(''),
  lang: z.enum(['ja', 'en']).default('ja'),
  useLlm: z.boolean().default(true),
});

const AspectBody = z.object({
  aspect: z.string().trim().min(1).max(100),
  papers: z.array(PaperInput).min(1).max(60),
  lang: z.enum(['ja', 'en']).default('ja'),
  useLlm: z.boolean().default(true),
});

const ClusterNamesBody = z.object({
  clusters: z
    .array(z.object({ id: z.string(), label: z.string().max(200), titles: z.array(z.string().max(500)).max(50) }))
    .min(1)
    .max(20),
  lang: z.enum(['ja', 'en']).default('ja'),
  useLlm: z.boolean().default(true),
});

const DraftBody = z.object({
  papers: z.array(PaperInput).min(1).max(80),
  groups: z.array(z.object({ label: z.string().max(200), paperIds: z.array(z.string()) })).default([]),
  topic: z.string().max(2000).default(''),
  lang: z.enum(['ja', 'en']).default('ja'),
  useLlm: z.boolean().default(true),
});

export function llmRoutes(services: Services) {
  return new Hono()
    .post('/summarize', async (c) => {
      const { paper, lang, useLlm } = await readJson(c, PaperBody);
      const p = paper as unknown as Paper;
      return streamText(c, async (events, signal) => {
        const llm = useLlm ? getLlm(services.config) : null;
        if (!llm || !p.abstract) {
          // No LLM (or nothing to summarize): extract key sentences instead.
          const text = extractiveSummary(p);
          events.delta(text);
          return { text, meta: { mode: 'fallback' } };
        }
        const text = await llm.streamText(
          { system: SUMMARY_SYSTEM, user: summaryUser(p, lang), effort: 'low', maxTokens: 4000, signal },
          events.delta,
        );
        return { text, meta: { mode: 'llm' } };
      });
    })
    .post('/related-work', async (c) => {
      const body = await readJson(c, DraftBody);
      const input = { papers: body.papers as unknown as Paper[], groups: body.groups, topic: body.topic, lang: body.lang };
      return streamText(c, async (events, signal) => {
        const llm = body.useLlm ? getLlm(services.config) : null;
        if (!llm) {
          const text = templateDraft(input);
          events.delta(text);
          return { text, meta: { mode: 'fallback' } };
        }
        const { text: block } = papersBlock(input);
        const text = await llm.streamText(
          {
            system: relatedWorkSystem(block),
            user: relatedWorkUser(body.topic, body.lang),
            effort: 'high',
            cacheSystem: true,
            signal,
          },
          events.delta,
        );
        return { text, meta: { mode: 'llm' } };
      });
    })
    .post('/gaps', async (c) => {
      const body = await readJson(c, GapsBody);
      const papers = body.papers as unknown as Paper[];
      const llm = body.useLlm ? getLlm(services.config) : null;
      const warnings: string[] = [];
      if (llm) {
        try {
          const out = await llm.structured({
            system: GAPS_SYSTEM,
            user: gapsUser(papers, body.topic, body.lang),
            schema: ResearchGaps,
            effort: 'high',
            maxTokens: 16000,
          });
          const gaps = out ? cleanGaps(out.gaps, papers) : [];
          if (gaps.length) return c.json({ mode: 'llm', gaps, warnings } satisfies GapsResponse);
          warnings.push('LLM の出力を読み取れなかったため、論文中の記述を集めました');
        } catch (err) {
          warnings.push(`LLM での分析に失敗しました（${(err as Error).message}）。論文中の記述を集めました`);
        }
      }
      return c.json({ mode: 'fallback', gaps: collectStatedGaps(papers, body.groups), warnings } satisfies GapsResponse);
    })
    .post('/fill-aspect', async (c) => {
      const body = await readJson(c, AspectBody);
      const papers = body.papers as unknown as Paper[];
      const llm = body.useLlm ? getLlm(services.config) : null;
      if (!llm) {
        if (!canFillWithoutLlm(body.aspect)) {
          throw new ApiHttpError(400, 'needs_llm', `「${body.aspect}」は LLM なしでは埋められません（手法・結果・目的・限界・データ・評価は可）`);
        }
        return c.json({ mode: 'fallback', values: fillByCue(body.aspect, papers) } satisfies AspectFillResponse);
      }
      const out = await llm
        .structured({ system: ASPECT_SYSTEM, user: aspectUser(body.aspect, papers, body.lang), schema: AspectValues, effort: 'low', maxTokens: 8000 })
        .catch((err: Error) => {
          throw new ApiHttpError(502, 'llm_error', err.message);
        });
      const ids = new Set(papers.map((p) => p.id));
      const values: Record<string, string> = {};
      for (const v of out?.values ?? []) if (ids.has(v.id)) values[v.id] = v.value.trim();
      return c.json({ mode: 'llm', values } satisfies AspectFillResponse);
    })
    .post('/cluster-names', async (c) => {
      const body = await readJson(c, ClusterNamesBody);
      const llm = body.useLlm ? getLlm(services.config) : null;
      if (!llm) return c.json({ mode: 'fallback', names: {} } satisfies ClusterNamesResponse);
      const out = await llm
        .structured({
          system: CLUSTER_NAMES_SYSTEM,
          user: clusterNamesUser(body.clusters, body.lang),
          schema: ClusterNames,
          effort: 'low',
          maxTokens: 2000,
        })
        .catch((err: Error) => {
          throw new ApiHttpError(502, 'llm_error', err.message);
        });
      const valid = new Set(body.clusters.map((cl) => cl.id));
      const names: Record<string, string> = {};
      for (const n of out?.names ?? []) if (valid.has(n.id) && n.name.trim()) names[n.id] = n.name.trim().slice(0, 80);
      return c.json({ mode: 'llm', names } satisfies ClusterNamesResponse);
    })
    .post('/translate', async (c) => {
      const { paper, lang } = await readJson(c, PaperBody);
      const p = paper as unknown as Paper;
      return streamText(c, async (events, signal) => {
        const llm = getLlm(services.config);
        if (!llm) throw new LlmError('api', '翻訳には ANTHROPIC_API_KEY の設定が必要です');
        if (!p.abstract) throw new LlmError('api', '抄録がないため翻訳できません');
        const text = await llm.streamText(
          { system: TRANSLATE_SYSTEM, user: translateUser(p, lang), effort: 'low', maxTokens: 8000, signal },
          events.delta,
        );
        return { text, meta: { mode: 'llm' } };
      });
    });
}
