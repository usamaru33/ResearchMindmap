import { Hono } from 'hono';
import { z } from 'zod';
import type { Paper } from '../../shared/types';
import { extractiveSummary } from '../core/summarize';
import { streamText } from '../http/sse';
import { readJson } from '../http/validate';
import { LlmError, getLlm } from '../llm/client';
import { SUMMARY_SYSTEM, TRANSLATE_SYSTEM, summaryUser, translateUser } from '../llm/prompts';
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

const PaperBody = z.object({ paper: PaperInput, lang: z.enum(['ja', 'en']).default('ja') });

export function llmRoutes(services: Services) {
  return new Hono()
    .post('/summarize', async (c) => {
      const { paper, lang } = await readJson(c, PaperBody);
      const p = paper as unknown as Paper;
      return streamText(c, async (events, signal) => {
        const llm = getLlm(services.config);
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
