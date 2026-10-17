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

export const ResearchGaps = z.object({
  gaps: z.array(
    z.object({
      title: z.string().describe('Short name of the open problem.'),
      description: z.string().describe('Two or three sentences: what is missing and why it matters.'),
      evidence: z
        .array(z.object({ paperId: z.string(), quote: z.string().describe('A short phrase from that paper supporting the gap.') }))
        .describe('Papers whose abstracts or notes support this gap.'),
      paperIds: z.array(z.string()).describe('Ids of all papers related to the gap.'),
      questions: z.array(z.string()).describe('One to three concrete research questions that would address the gap.'),
    }),
  ),
});

export const ClusterNames = z.object({
  names: z.array(z.object({ id: z.string(), name: z.string().describe('A 2-6 word name for what the papers share.') })),
});
