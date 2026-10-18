import type { ParsedQuery } from '../../shared/query';
import type { Paper, SourceName } from '../../shared/types';
import type { AppConfig } from '../config';
import type { HttpClient } from '../infra/http';

export interface SourceContext {
  http: HttpClient;
  config: AppConfig;
  signal?: AbortSignal;
}

export interface SourceSearchOptions {
  /** Max results wanted from this source. */
  limit: number;
}

export interface SourceResult {
  papers: Paper[];
  /** Total hits reported by the source, if known. */
  total?: number;
  /** Conditions the source could not express exactly (short Japanese sentences). */
  warnings: string[];
  /** True when results may not satisfy the query exactly and must be post-filtered. */
  approximate: boolean;
}

export interface SourceAdapter {
  name: SourceName;
  label: string;
  status(config: AppConfig): { enabled: boolean; reason?: string; reasonEn?: string };
  search(query: ParsedQuery, opts: SourceSearchOptions, ctx: SourceContext): Promise<SourceResult>;
}
