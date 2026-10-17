import { canonicalId, normalizeTitle } from '../../shared/ids';
import type { ExternalIds, Paper, SourceName } from '../../shared/types';

const PREPRINT_VENUE = /^(arxiv|biorxiv|medrxiv|ssrn|research square|preprints?)\b/i;

function better<T>(a: T | undefined, b: T | undefined, prefer: (x: T, y: T) => boolean): T | undefined {
  if (a === undefined || a === null || a === '') return b;
  if (b === undefined || b === null || b === '') return a;
  return prefer(b, a) ? b : a;
}

function union<T>(a: T[] | undefined, b: T[] | undefined): T[] | undefined {
  if (!a?.length) return b;
  if (!b?.length) return a;
  return [...new Set([...a, ...b])];
}

/** Combine two records of the same work, keeping the most informative value of each field. */
export function mergeTwo(a: Paper, b: Paper): Paper {
  const ids: ExternalIds = { ...b.ids };
  for (const [k, v] of Object.entries(a.ids ?? {})) {
    if (v) ids[k as keyof ExternalIds] = v;
  }
  const venue = better(a.venue, b.venue, (x, y) => PREPRINT_VENUE.test(y) && !PREPRINT_VENUE.test(x)) ?? '';
  const merged: Paper = {
    ...a,
    title: better(a.title, b.title, (x, y) => y === y.toUpperCase() && x !== x.toUpperCase()) ?? '',
    authors: (b.authors?.length ?? 0) > (a.authors?.length ?? 0) ? b.authors : a.authors,
    belongs: a.belongs || b.belongs,
    // Prefer the year of the published version over the preprint.
    year: a.year && b.year ? (PREPRINT_VENUE.test(a.venue) ? b.year : a.year) : a.year || b.year,
    venue,
    abstract: better(a.abstract, b.abstract, (x, y) => x.length > y.length) ?? '',
    ids,
    url: a.url ?? b.url,
    pdfUrl: a.pdfUrl ?? b.pdfUrl,
    citationCount: Math.max(a.citationCount ?? 0, b.citationCount ?? 0) || a.citationCount || b.citationCount,
    referenceIds: union(a.referenceIds, b.referenceIds),
    topics: a.topics?.length ? a.topics : b.topics,
    keywords: union(a.keywords, b.keywords),
    publisher: a.publisher ?? b.publisher,
    type: a.type ?? b.type,
    sources: union(a.sources, b.sources) as SourceName[] | undefined,
    thumbnailUrl: a.thumbnailUrl ?? b.thumbnailUrl,
  };
  merged.id = canonicalId(ids, merged.title, merged.year);
  return merged;
}

function identityKeys(p: Paper): string[] {
  const keys: string[] = [];
  const ids = p.ids ?? {};
  if (ids.doi) keys.push(`doi:${ids.doi}`);
  if (ids.arxiv) keys.push(`arxiv:${ids.arxiv}`);
  if (ids.openalex) keys.push(`openalex:${ids.openalex}`);
  if (ids.s2) keys.push(`s2:${ids.s2}`);
  if (ids.pmid) keys.push(`pmid:${ids.pmid}`);
  if (ids.ieee) keys.push(`ieee:${ids.ieee}`);
  if (ids.dblp) keys.push(`dblp:${ids.dblp}`);
  return keys;
}

function titleKey(p: Paper): string | null {
  const t = normalizeTitle(p.title);
  // Very short titles ("Introduction", "Editorial") are not identifying.
  return t.length >= 20 ? `title:${t}` : null;
}

export interface MergeResult {
  papers: Paper[];
  /** For each input paper (by list index and position), the index into `papers`. */
  assignments: number[][];
}

/**
 * Merge several result lists into unique works. Two records are the same work
 * when they share any external id, or their normalized titles match and the
 * years differ by at most one (preprint vs. published).
 */
export function mergePaperLists(lists: Paper[][]): MergeResult {
  const papers: Paper[] = [];
  const byKey = new Map<string, number>();
  const assignments: number[][] = [];

  for (const list of lists) {
    const assigned: number[] = [];
    for (const paper of list) {
      const keys = identityKeys(paper);
      let idx = keys.map((k) => byKey.get(k)).find((i) => i !== undefined);
      const tKey = titleKey(paper);
      if (idx === undefined && tKey) {
        const candidate = byKey.get(tKey);
        if (candidate !== undefined) {
          const other = papers[candidate];
          if (!paper.year || !other.year || Math.abs(paper.year - other.year) <= 1) idx = candidate;
        }
      }
      if (idx === undefined) {
        idx = papers.length;
        papers.push(paper);
      } else {
        papers[idx] = mergeTwo(papers[idx], paper);
      }
      for (const k of [...identityKeys(papers[idx]), ...(tKey ? [tKey] : [])]) {
        if (!byKey.has(k)) byKey.set(k, idx);
      }
      assigned.push(idx);
    }
    assignments.push(assigned);
  }
  return { papers, assignments };
}
