// Types shared by the browser app (src/) and the API server (server/).

import type { ParsedQuery, QueryError } from './query/ast';

export type SourceName =
  | 'openalex'
  | 'semanticscholar'
  | 'crossref'
  | 'arxiv'
  | 'pubmed'
  | 'ieee'
  | 'dblp';

export interface ExternalIds {
  doi?: string;
  arxiv?: string;
  openalex?: string;
  s2?: string;
  pmid?: string;
  dblp?: string;
  ieee?: string;
}

export interface Topic {
  id: string;
  name: string;
  level: 'topic' | 'subfield' | 'field' | 'domain';
  score?: number;
}

export type ReadingStatus = 'unread' | 'reading' | 'read' | 'skipped';

export interface Screening {
  decision: 'include' | 'exclude' | 'maybe';
  reason?: string;
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  belongs: string;
  year: number;
  venue: string;
  abstract: string;
  challenges: string;
  futureWork: string;
  /** IDs of papers in the same map that this paper cites. */
  references: string[];
  thumbnailUrl?: string;
  ids?: ExternalIds;
  url?: string;
  pdfUrl?: string;
  citationCount?: number;
  /** External work IDs this paper cites (may be outside the map), e.g. OpenAlex W-IDs. */
  referenceIds?: string[];
  topics?: Topic[];
  keywords?: string[];
  publisher?: string;
  type?: string;
  sources?: SourceName[];
  relevance?: number;
  status?: ReadingStatus;
  tags?: string[];
  notes?: string;
  rating?: number;
  screening?: Screening;
  /** Comparison-table cells, by aspect name. */
  comparison?: Record<string, string>;
  /** Citation key kept from an imported BibTeX entry, so existing drafts still match. */
  citeKey?: string;
  addedAt?: string;
}

export interface SourceStatus {
  name: SourceName;
  label: string;
  enabled: boolean;
  reason?: string;
  /** English version of `reason`, for the English UI. */
  reasonEn?: string;
}

export interface HealthResponse {
  ok: boolean;
  version: string;
  sources: SourceStatus[];
  llm: { enabled: boolean; model: string | null; reason?: string; reasonEn?: string };
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface QueryParseResponse {
  ok: boolean;
  query?: ParsedQuery;
  /** Canonical RQL text for the parsed query. */
  canonical?: string;
  errors: QueryError[];
  warnings: QueryError[];
}

export interface SourceReport {
  name: SourceName;
  label: string;
  status: 'ok' | 'error' | 'skipped';
  /** Results returned by the source. */
  count: number;
  /** Results that survived merging and post-filtering. */
  kept?: number;
  /** Total hits the source reported. */
  total?: number;
  warnings: string[];
  approximate?: boolean;
  error?: string;
  tookMs: number;
}

export interface SearchRequest {
  query: string;
  sources?: SourceName[];
  limitPerSource?: number;
  limit?: number;
  enrich?: boolean;
}

export interface SearchResponse {
  results: Paper[];
  perSource: SourceReport[];
  query: ParsedQuery;
  canonical: string;
  warnings: string[];
  /** Unique works before post-filtering. */
  candidates: number;
  enriched: number;
  tookMs: number;
}

export interface VagueStage {
  kind: 'semantic' | 'query' | 's2';
  label: string;
  query?: string;
  count: number;
  tookMs?: number;
  error?: string;
}

export interface VagueSearchRequest {
  description: string;
  limit?: number;
  useLlm?: boolean;
  lang?: 'ja' | 'en';
  yearMin?: number;
  yearMax?: number;
}

export interface VagueSearchResponse {
  results: Paper[];
  /** `llm` when Claude expanded or reranked; `fallback` when only non-LLM methods ran. */
  mode: 'llm' | 'fallback';
  englishSummary?: string;
  expandedQueries: string[];
  concepts: string[];
  /** Why each paper is relevant (LLM mode only), by paper id. */
  reasons: Record<string, string>;
  stages: VagueStage[];
  warnings: string[];
  candidates: number;
  tookMs: number;
}

export interface Cluster {
  id: string;
  label: string;
  /** OpenAlex topic level, or `keyword` for facet clusters. */
  level: Topic['level'] | 'keyword';
  paperIds: string[];
}

export interface GraphBuildRequest {
  papers: Paper[];
  clusterLevel?: Topic['level'] | 'keyword' | 'auto';
}

export interface GraphBuildResponse {
  /** Input papers, enriched, with `references` set to the in-set papers they cite. */
  papers: Paper[];
  citationLinks: Array<{ source: string; target: string }>;
  clusters: Cluster[];
  enriched: number;
  warnings: string[];
}

export interface GapItem {
  title: string;
  description: string;
  /** Sentences from the papers that support the gap. */
  evidence: Array<{ paperId: string; quote: string }>;
  paperIds: string[];
  /** Candidate research questions that would address the gap. */
  questions: string[];
}

export interface GapsResponse {
  mode: 'llm' | 'fallback';
  gaps: GapItem[];
  warnings: string[];
}

export interface AspectFillResponse {
  mode: 'llm' | 'fallback';
  /** Cell value by paper id ('' when the abstract does not say). */
  values: Record<string, string>;
}

export interface ClusterNamesResponse {
  mode: 'llm' | 'fallback';
  /** New label by cluster id (only clusters the model renamed). */
  names: Record<string, string>;
}

export type ExpandKind = 'references' | 'citations' | 'related';

export interface ExpandResponse {
  kind: ExpandKind;
  papers: Paper[];
  /** How many links exist in total (the list may be truncated to the limit). */
  total: number;
  warnings: string[];
}

export interface ResolveItem {
  input: string;
  kind?: 'doi' | 'arxiv' | 'openalex' | 'pmid' | 'title' | 'citation';
  ok: boolean;
  paper?: Paper;
  /** For free-text references: how sure the match is (low = the title fits but the year or first author does not). */
  confidence?: 'high' | 'low';
  error?: string;
}

export interface ResolveResponse {
  items: ResolveItem[];
}

export type ExploreKind = 'author' | 'venue';

/** An author or a venue (journal / conference) found in OpenAlex. */
export interface ExploreEntity {
  kind: ExploreKind;
  /** OpenAlex id, e.g. A5001226970 or S4363607743. */
  id: string;
  name: string;
  /** Institution for an author; publisher or venue type for a venue. */
  detail?: string;
  worksCount: number;
  citedByCount: number;
  hIndex?: number;
  topics: string[];
  orcid?: string;
}

export interface ExploreSearchResponse {
  entities: ExploreEntity[];
}

export type ExploreSort = 'cited' | 'recent';

export interface ExploreWorksRequest {
  kind: ExploreKind;
  id: string;
  limit?: number;
  sort?: ExploreSort;
  yearMin?: number;
  yearMax?: number;
}

export interface ExploreWorksResponse {
  papers: Paper[];
  /** Works matching the filter (the list is truncated to the limit). */
  total: number;
  /** Publication count per year across all works, oldest first. */
  byYear: Array<{ year: number; count: number }>;
}

/** How a recommended paper connects to the seed papers (counts of seeds). */
export interface RecommendReason {
  /** Seeds that cite it. */
  cocited: number;
  /** Seeds it cites. */
  citing: number;
  /** Seeds OpenAlex lists it as related to. */
  related: number;
}

export interface RecommendResponse {
  papers: Paper[];
  /** By paper id. */
  reasons: Record<string, RecommendReason>;
  /** Seeds found in OpenAlex. */
  seeds: number;
  /** Candidates considered before ranking. */
  candidates: number;
}

/** A paper as sent to /api/papers/check. */
export interface CheckInput {
  id: string;
  title: string;
  year: number;
  venue?: string;
  type?: string;
  authors?: string[];
  ids?: { doi?: string; arxiv?: string; openalex?: string };
}

export interface CheckResponse {
  /** Ids of papers OpenAlex marks as retracted. */
  retracted: string[];
  /** Published versions of preprints, by preprint id. */
  published: Record<string, Paper>;
  checked: { retraction: number; preprints: number; preprintTotal: number };
  /** Parts of the check that could not be done. */
  failed: Array<'retraction' | 'published'>;
}

export interface YearCount {
  year: number;
  count: number;
}

/** Papers per year matching one query (POST /api/trends). */
export interface TrendSeries {
  query: string;
  byYear: YearCount[];
  total: number;
  /** Parts of the query could not be applied in the count (wildcards, venues, types…). */
  approximate: boolean;
  error?: 'invalid_query' | 'upstream';
  message?: string;
}

export interface TrendsResponse {
  series: TrendSeries[];
  /** All works per year in the same range, for shares; absent when not requested or unavailable. */
  all?: YearCount[];
  yearMin: number;
  yearMax: number;
}
