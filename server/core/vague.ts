import { parseQuery, type ParsedQuery } from '../../shared/query';
import type { Paper, SourceName, VagueStage } from '../../shared/types';
import { LlmError, type LlmBackend } from '../llm/client';
import { EXPAND_SYSTEM, RERANK_SYSTEM, expandUser, rerankUser } from '../llm/prompts';
import { QueryExpansion, RelevanceRatings } from '../llm/schemas';
import { fuseRankedLists } from './rank';
import type { SearchOptions, SearchOutcome } from './search';
import { bm25Scores, fallbackQueries, hasLatinWords } from './textRank';

export interface VagueOptions {
  limit: number;
  useLlm: boolean;
  lang: 'ja' | 'en';
  yearMin?: number;
  yearMax?: number;
}

export interface VagueDeps {
  llm: LlmBackend | null;
  semantic: (text: string, opts: { limit: number; yearMin?: number; yearMax?: number }) => Promise<Paper[]>;
  search: (query: ParsedQuery, opts: SearchOptions) => Promise<SearchOutcome>;
  s2: (text: string, opts: { limit: number }) => Promise<Paper[]>;
  enrich: (papers: Paper[]) => Promise<{ papers: Paper[]; enriched: number; error?: string }>;
}

export interface VagueOutcome {
  results: Paper[];
  mode: 'llm' | 'fallback';
  englishSummary?: string;
  expandedQueries: string[];
  concepts: string[];
  reasons: Record<string, string>;
  stages: VagueStage[];
  warnings: string[];
  candidates: number;
}

const RERANK_TOP = 60;
const SEMANTIC_LIMIT = 50;
const QUERY_SOURCES: SourceName[] = ['openalex', 'crossref', 'arxiv', 'pubmed'];

function withYear(q: ParsedQuery, yearMin?: number, yearMax?: number): ParsedQuery {
  if (yearMin === undefined && yearMax === undefined) return q;
  return { ...q, filters: { ...q.filters, yearMin: yearMin ?? q.filters.yearMin, yearMax: yearMax ?? q.filters.yearMax } };
}

async function expand(description: string, llm: LlmBackend, warnings: string[]): Promise<QueryExpansion | null> {
  try {
    const out = await llm.structured({
      system: EXPAND_SYSTEM,
      user: expandUser(description),
      schema: QueryExpansion,
      effort: 'medium',
      maxTokens: 4000,
    });
    if (!out) warnings.push('LLM の出力を読み取れなかったため、キーワード抽出で代替しました');
    return out;
  } catch (err) {
    warnings.push(`LLM でのクエリ展開に失敗しました（${(err as Error).message}）。キーワード抽出で代替します`);
    return null;
  }
}

async function rerankWithLlm(
  idea: string,
  summary: string | undefined,
  papers: Paper[],
  llm: LlmBackend,
  lang: string,
): Promise<Map<string, { score: number; reason: string }> | null> {
  const out = await llm.structured({
    system: RERANK_SYSTEM,
    user: rerankUser(idea, summary, papers, lang),
    schema: RelevanceRatings,
    effort: 'low',
    maxTokens: 16000,
  });
  if (!out) return null;
  const valid = new Set(papers.map((p) => p.id));
  const map = new Map<string, { score: number; reason: string }>();
  for (const r of out.ratings) {
    if (valid.has(r.id)) map.set(r.id, { score: Math.max(0, Math.min(3, Math.round(r.score))), reason: r.reason });
  }
  // A rating list that skips most papers is not trustworthy.
  return map.size >= papers.length * 0.5 ? map : null;
}

/** "なんとなく検索": find papers matching a loose description. See docs/DESIGN.md §6. */
export async function vagueSearch(description: string, opts: VagueOptions, deps: VagueDeps): Promise<VagueOutcome> {
  const warnings: string[] = [];
  const llm = opts.useLlm ? deps.llm : null;

  // 1. Understand the description.
  const expansion = llm ? await expand(description, llm, warnings) : null;
  const semanticText = expansion?.englishSummary?.trim() || description;
  let queries: string[] = [];
  if (expansion) {
    for (const q of expansion.queries.slice(0, 5)) {
      if (parseQuery(q).ok) queries.push(q);
    }
    if (queries.length < expansion.queries.length) warnings.push('LLM が作った検索式のうち構文の誤りがあるものは使いませんでした');
  }
  if (queries.length === 0 && hasLatinWords(description)) queries = fallbackQueries(description);
  if (!expansion && !hasLatinWords(description)) {
    warnings.push('LLM が使えないため日本語の説明をそのまま意味検索にかけました。英語で書くか APIキーを設定すると精度が上がります');
  }

  // 2. Retrieve along three paths in parallel.
  const stages: VagueStage[] = [];
  const stage = async (s: Omit<VagueStage, 'count'>, run: () => Promise<Paper[]>): Promise<Paper[]> => {
    const started = Date.now();
    try {
      const papers = await run();
      stages.push({ ...s, count: papers.length, tookMs: Date.now() - started });
      return papers;
    } catch (err) {
      stages.push({ ...s, count: 0, tookMs: Date.now() - started, error: (err as Error).message });
      return [];
    }
  };
  const [semantic, s2, ...queryLists] = await Promise.all([
    stage({ kind: 'semantic', label: 'OpenAlex 意味検索' }, () =>
      deps.semantic(semanticText, { limit: SEMANTIC_LIMIT, yearMin: opts.yearMin, yearMax: opts.yearMax }),
    ),
    stage({ kind: 's2', label: 'Semantic Scholar 関連度検索' }, () => deps.s2(semanticText, { limit: 30 })),
    ...queries.map((q, i) =>
      stage({ kind: 'query', label: `検索式 ${i + 1}`, query: q }, async () => {
        const parsed = parseQuery(q);
        if (!parsed.ok) return [];
        const out = await deps.search(withYear(parsed.query, opts.yearMin, opts.yearMax), {
          // arXiv is slow to page (3 s between calls): only the most specific query uses it.
          sources: i === 0 ? QUERY_SOURCES : ['openalex', 'crossref'],
          limitPerSource: 15,
          limit: 40,
          enrich: false,
        });
        return out.results;
      }),
    ),
  ]);
  const order = (s: VagueStage) => (s.kind === 'semantic' ? 0 : s.kind === 'query' ? 1 : 2);
  stages.sort((a, b) => order(a) - order(b) || a.label.localeCompare(b.label));

  // 3. Fuse: semantic matches count double, they are the most on-topic signal.
  const fused = fuseRankedLists([semantic, ...queryLists, s2], {
    weights: [2, ...queryLists.map(() => 1), 1],
    citationWeight: 0,
  }).filter((p) => opts.yearMin === undefined || p.year >= opts.yearMin)
    .filter((p) => opts.yearMax === undefined || p.year <= opts.yearMax);
  if (fused.length === 0) {
    return { results: [], mode: expansion ? 'llm' : 'fallback', englishSummary: expansion?.englishSummary, expandedQueries: queries, concepts: expansion?.concepts ?? [], reasons: {}, stages, warnings, candidates: 0 };
  }

  // 4. Enrich so the reranker sees abstracts.
  const top = fused.slice(0, 100);
  const enriched = await deps.enrich(top);
  if (enriched.error) warnings.push(`OpenAlex での補完に失敗しました: ${enriched.error}`);
  const pool = enriched.papers;

  // 5. Rerank the head of the list.
  const head = pool.slice(0, RERANK_TOP);
  let ratings: Map<string, { score: number; reason: string }> | null = null;
  if (llm) {
    try {
      ratings = await rerankWithLlm(description, expansion?.englishSummary, head, llm, opts.lang);
      if (!ratings) warnings.push('LLM の関連度判定を読み取れなかったため、語の一致（BM25）で並べ替えました');
    } catch (err) {
      warnings.push(`LLM での関連度判定に失敗しました（${err instanceof LlmError ? err.message : 'エラー'}）。語の一致（BM25）で並べ替えます`);
    }
  }
  const lexical = ratings ? null : bm25Scores([semanticText, ...(expansion?.concepts ?? [])].join(' '), head);
  const maxCites = Math.max(...pool.map((p) => p.citationCount ?? 0), 1);
  const reasons: Record<string, string> = {};
  const scored = pool.map((p, i) => {
    const rrf = p.relevance ?? 0;
    const cites = Math.log10(1 + (p.citationCount ?? 0)) / Math.log10(1 + maxCites);
    let rerank = 0;
    if (i < head.length) {
      if (ratings) {
        const r = ratings.get(p.id);
        rerank = r ? r.score / 3 : 0;
        if (r) reasons[p.id] = r.reason;
      } else if (lexical && lexical.some((x) => x > 0)) {
        rerank = lexical[i];
      } else {
        rerank = rrf;
      }
    }
    const relevance = 0.6 * rerank + 0.3 * rrf + 0.1 * cites;
    return { paper: { ...p, relevance: Math.round(relevance * 1000) / 1000 }, unrelated: ratings?.get(p.id)?.score === 0 };
  });
  const dropped = scored.filter((s) => s.unrelated).length;
  if (dropped) warnings.push(`LLM が無関係と判定した ${dropped} 件を除きました`);
  const results = scored
    .filter((s) => !s.unrelated)
    .map((s) => s.paper)
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
    .slice(0, opts.limit);

  return {
    results,
    mode: expansion || ratings ? 'llm' : 'fallback',
    englishSummary: expansion?.englishSummary,
    expandedQueries: queries,
    concepts: expansion?.concepts ?? [],
    reasons,
    stages,
    warnings,
    candidates: fused.length,
  };
}
