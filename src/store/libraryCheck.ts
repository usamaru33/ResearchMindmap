import type { Paper } from '../types';
import { keysOf } from './identity';

/** Groups of papers in the map that are the same work (shared id, DOI, arXiv id or title within a year). */
export function findDuplicates(papers: Paper[]): Paper[][] {
  const parent = papers.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const seen = new Map<string, number[]>();
  papers.forEach((p, i) => {
    for (const k of keysOf(p)) {
      if (k.startsWith('id:')) continue;
      const list = seen.get(k) ?? [];
      for (const j of list) {
        if (k.startsWith('title:') && papers[j].year && p.year && Math.abs(papers[j].year - p.year) > 1) continue;
        parent[find(i)] = find(j);
      }
      list.push(i);
      seen.set(k, list);
    }
  });
  const groups = new Map<number, Paper[]>();
  papers.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p]));
  return [...groups.values()].filter((g) => g.length > 1);
}

export type MissingField = 'year' | 'authors' | 'venue' | 'abstract' | 'doi';
export const MISSING_FIELDS: MissingField[] = ['year', 'authors', 'venue', 'abstract', 'doi'];

export function missingFields(p: Paper): MissingField[] {
  const out: MissingField[] = [];
  if (!p.year) out.push('year');
  if (p.authors.length === 0) out.push('authors');
  if (!p.venue) out.push('venue');
  if (!p.abstract) out.push('abstract');
  // arXiv-only papers have an id to cite; only papers with no identifier at all lack a DOI here.
  if (!p.ids?.doi && !p.ids?.arxiv) out.push('doi');
  return out;
}

/** A preprint with no DOI of its own beyond arXiv's: it may have been published since. */
export function isPreprint(p: Paper): boolean {
  const arxivOnly = !!p.ids?.arxiv && (!p.ids.doi || p.ids.doi.startsWith('10.48550/'));
  return p.type === 'preprint' || p.type === 'posted-content' || arxivOnly || /^arxiv/i.test(p.venue);
}

/** How much a record knows: used to pick which duplicate to keep. */
export function richness(p: Paper): number {
  return (
    (MISSING_FIELDS.length - missingFields(p).length) * 10 +
    (p.notes ? 5 : 0) +
    (p.tags?.length ?? 0) +
    (p.rating ?? 0) +
    p.references.length +
    Math.log10(1 + (p.citationCount ?? 0))
  );
}

/**
 * Replace a preprint's bibliographic data with its published version, keeping
 * the user's notes, tags, rating, status and links, and the arXiv id.
 */
export function publishedPatch(preprint: Paper, published: Paper): Partial<Paper> {
  return {
    title: published.title || preprint.title,
    authors: published.authors.length ? published.authors : preprint.authors,
    year: published.year || preprint.year,
    venue: published.venue || preprint.venue,
    abstract: published.abstract || preprint.abstract,
    ids: { ...preprint.ids, ...published.ids, arxiv: preprint.ids?.arxiv ?? published.ids?.arxiv },
    url: published.url ?? preprint.url,
    pdfUrl: preprint.pdfUrl ?? published.pdfUrl,
    citationCount: Math.max(preprint.citationCount ?? 0, published.citationCount ?? 0) || undefined,
    publisher: published.publisher ?? preprint.publisher,
    type: published.type ?? preprint.type,
    referenceIds: published.referenceIds?.length ? published.referenceIds : preprint.referenceIds,
  };
}

const STATUS_ORDER = ['unread', 'skipped', 'reading', 'read'] as const;

/** One paper from several records of the same work: the kept record wins, gaps are filled from the others. */
export function mergePaperRecords(keep: Paper, others: Paper[]): Paper {
  const merged: Paper = { ...keep, ids: { ...keep.ids } };
  const fill = <K extends keyof Paper>(key: K) => {
    if (merged[key] === undefined || merged[key] === '' || (Array.isArray(merged[key]) && (merged[key] as unknown[]).length === 0)) {
      const donor = others.find((o) => o[key] !== undefined && o[key] !== '' && !(Array.isArray(o[key]) && (o[key] as unknown[]).length === 0));
      if (donor) merged[key] = donor[key];
    }
  };
  for (const key of ['authors', 'belongs', 'venue', 'abstract', 'challenges', 'futureWork', 'thumbnailUrl', 'url', 'pdfUrl', 'topics', 'publisher', 'type', 'screening', 'citeKey', 'addedAt'] as const) fill(key);
  if (!merged.year) merged.year = others.find((o) => o.year)?.year ?? 0;
  for (const o of others) {
    for (const [k, v] of Object.entries(o.ids ?? {})) {
      const key = k as keyof NonNullable<Paper['ids']>;
      if (v && !merged.ids![key]) merged.ids![key] = v;
    }
  }
  const all = [keep, ...others];
  const union = (lists: Array<string[] | undefined>) => [...new Set(lists.flatMap((l) => l ?? []))];
  const tags = union(all.map((p) => p.tags));
  if (tags.length) merged.tags = tags;
  const keywords = union(all.map((p) => p.keywords));
  if (keywords.length) merged.keywords = keywords;
  const referenceIds = union(all.map((p) => p.referenceIds));
  if (referenceIds.length) merged.referenceIds = referenceIds;
  const sources = union(all.map((p) => p.sources)) as Paper['sources'];
  if (sources?.length) merged.sources = sources;
  const notes = [...new Set(all.map((p) => p.notes?.trim()).filter((n): n is string => !!n))];
  if (notes.length) merged.notes = notes.join('\n\n');
  const rating = Math.max(...all.map((p) => p.rating ?? 0));
  if (rating) merged.rating = rating;
  const citations = Math.max(...all.map((p) => p.citationCount ?? 0));
  if (citations) merged.citationCount = citations;
  const status = all.map((p) => p.status).filter(Boolean).sort((a, b) => STATUS_ORDER.indexOf(b!) - STATUS_ORDER.indexOf(a!))[0];
  if (status) merged.status = status;
  const comparison = Object.assign({}, ...[...others].reverse().map((p) => p.comparison ?? {}), keep.comparison ?? {});
  if (Object.keys(comparison).length) merged.comparison = comparison;
  if (Object.keys(merged.ids!).length === 0) delete merged.ids;
  return merged;
}
