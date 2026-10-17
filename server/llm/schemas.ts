import { z } from 'zod';

export const QueryExpansion = z.object({
  englishSummary: z
    .string()
    .describe('A precise 2-4 sentence English description of the research idea, using standard terminology of the field.'),
  queries: z
    .array(z.string())
    .describe('3 to 5 boolean literature-search queries in RQL syntax, from specific to broad.'),
  concepts: z.array(z.string()).describe('5 to 10 key concepts, synonyms or closely related terms, in English.'),
});
export type QueryExpansion = z.infer<typeof QueryExpansion>;

export const RelevanceRatings = z.object({
  ratings: z.array(
    z.object({
      id: z.string().describe('The paper id exactly as given in brackets.'),
      // Bounds are enforced in code: structured outputs support only a subset of JSON Schema.
      score: z.number().int().describe('0 unrelated, 1 tangential, 2 related, 3 directly on topic.'),
      reason: z.string().describe('One short sentence in the requested language on how the paper relates.'),
    }),
  ),
});
export type RelevanceRatings = z.infer<typeof RelevanceRatings>;
