// Types shared by the browser app (src/) and the API server (server/).

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
  addedAt?: string;
}

export interface SourceStatus {
  name: SourceName;
  label: string;
  enabled: boolean;
  reason?: string;
}

export interface HealthResponse {
  ok: boolean;
  version: string;
  sources: SourceStatus[];
  llm: { enabled: boolean; model: string | null; reason?: string };
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
