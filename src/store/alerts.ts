import type { HistoryEntry, Paper } from '../types';

/** Keep the seen list bounded; older keys fall off first. */
export const SEEN_LIMIT = 1000;
/** Automatic checks on opening the app run at most this often per search. */
export const AUTO_CHECK_HOURS = 24;

/** Keys that identify a paper across runs (its id and DOI). */
export function paperKeys(p: Paper): string[] {
  const keys = [p.id];
  if (p.ids?.doi) keys.push(`doi:${p.ids.doi.toLowerCase()}`);
  if (p.ids?.openalex) keys.push(`openalex:${p.ids.openalex}`);
  return keys;
}

export function seenKeys(papers: Paper[]): string[] {
  return papers.flatMap(paperKeys);
}

/** Newest keys first, deduplicated, capped. */
export function mergeSeen(old: string[] | undefined, added: string[]): string[] {
  return [...new Set([...added, ...(old ?? [])])].slice(0, SEEN_LIMIT);
}

/** Papers not seen in earlier runs of the search. */
export function unseenPapers(results: Paper[], seen: string[] | undefined): Paper[] {
  const set = new Set(seen ?? []);
  return results.filter((p) => !paperKeys(p).some((k) => set.has(k)));
}

/**
 * The query used to look for new papers: the saved query limited to this year
 * and last year, so recent work is not crowded out by older, better-ranked papers.
 */
export function alertQuery(text: string, now: Date): string {
  const trimmed = text.trim();
  const wrapped = /\bOR\b|\|\|/.test(trimmed) ? `(${trimmed})` : trimmed;
  return `${wrapped} year:>=${now.getFullYear() - 1}`;
}

/** Saved query searches that can be checked for new papers. */
export function watchedEntries(history: HistoryEntry[]): HistoryEntry[] {
  return history.filter((h) => h.pinned && h.kind === 'query');
}

export function dueForCheck(entry: HistoryEntry, now: Date, hours = AUTO_CHECK_HOURS): boolean {
  if (!entry.checkedAt) return true;
  const last = new Date(entry.checkedAt).getTime();
  return Number.isNaN(last) || now.getTime() - last >= hours * 3600 * 1000;
}
