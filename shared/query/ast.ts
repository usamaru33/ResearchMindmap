// RQL (Research Query Language) abstract syntax tree. See docs/DESIGN.md §5.2.

/** Text fields a term can be restricted to. `tiab` = title + abstract + keywords. */
export type TextField = 'all' | 'title' | 'abstract' | 'tiab' | 'author' | 'venue' | 'keyword';

export type FilterField = 'year' | 'publisher' | 'type' | 'oa' | 'lang';

export interface TermNode {
  type: 'term';
  field: TextField;
  value: string;
  /** Quoted phrase: words must appear adjacent and in order. */
  phrase: boolean;
  /** Trailing `*`: prefix match on the last word. */
  wildcard: boolean;
}

export interface AndNode {
  type: 'and';
  children: QueryNode[];
}

export interface OrNode {
  type: 'or';
  children: QueryNode[];
}

export interface NotNode {
  type: 'not';
  child: QueryNode;
}

export type QueryNode = TermNode | AndNode | OrNode | NotNode;

/** Non-text constraints; only allowed in the top-level conjunction. */
export interface QueryFilters {
  yearMin?: number;
  yearMax?: number;
  /** Lower-case publisher keys, e.g. `acm`, `ieee`. */
  publishers: string[];
  types: string[];
  openAccess?: boolean;
  languages: string[];
}

export interface ParsedQuery {
  /** Text part of the query; null when the query only has filters. */
  text: QueryNode | null;
  filters: QueryFilters;
}

export interface QueryError {
  message: string;
  /** Character offsets into the input (end exclusive). */
  start: number;
  end: number;
}

export type ParseResult =
  | { ok: true; query: ParsedQuery; warnings: QueryError[] }
  | { ok: false; errors: QueryError[] };

export function emptyFilters(): QueryFilters {
  return { publishers: [], types: [], languages: [] };
}
