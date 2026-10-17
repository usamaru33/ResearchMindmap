export interface FilterChips {
  yearFrom: string;
  yearTo: string;
  publishers: string[];
  openAccess: boolean;
}

export const EMPTY_CHIPS: FilterChips = { yearFrom: '', yearTo: '', publishers: [], openAccess: false };

export const PUBLISHER_CHIPS: Array<{ key: string; label: string }> = [
  { key: 'acm', label: 'ACM' },
  { key: 'ieee', label: 'IEEE' },
  { key: 'springer', label: 'Springer' },
  { key: 'elsevier', label: 'Elsevier' },
  { key: 'arxiv', label: 'arXiv' },
];

/** Turn the filter chips into RQL clauses appended (AND) to the typed query. */
export function chipsToQuery(chips: FilterChips): string {
  const parts: string[] = [];
  const from = chips.yearFrom.trim();
  const to = chips.yearTo.trim();
  if (from && to) parts.push(`year:${from}..${to}`);
  else if (from) parts.push(`year:>=${from}`);
  else if (to) parts.push(`year:<=${to}`);
  if (chips.publishers.length === 1) parts.push(`publisher:${chips.publishers[0]}`);
  else if (chips.publishers.length > 1) parts.push(`publisher:(${chips.publishers.join(' OR ')})`);
  if (chips.openAccess) parts.push('oa:true');
  return parts.join(' ');
}

/** The full query sent to the API: typed text plus chip filters. */
export function combineQuery(text: string, chips: FilterChips): string {
  const extra = chipsToQuery(chips);
  const trimmed = text.trim();
  if (!extra) return trimmed;
  if (!trimmed) return extra;
  // Group the typed query so a top-level OR is not split by the appended filters.
  return /\bOR\b|\|\|/.test(trimmed) ? `(${trimmed}) ${extra}` : `${trimmed} ${extra}`;
}
