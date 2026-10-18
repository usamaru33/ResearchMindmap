import type { Paper, ReadingStatus } from '../../shared/types';
import { authorKey } from './coauthors';

export type Count = { label: string; count: number };

export interface MapStats {
  total: number;
  status: Record<ReadingStatus, number>;
  screening: { include: number; maybe: number; exclude: number; pending: number };
  /** Share of papers with an open-access PDF link. */
  openAccess: number;
  withAbstract: number;
  citations: { median: number; max: number; known: number };
  byYear: Array<{ year: number; count: number }>;
  undated: number;
  venues: Count[];
  authors: Count[];
  tags: Count[];
  publishers: Count[];
  topCited: Paper[];
}

/** Count values case-insensitively, labelled by their most frequent spelling, most common first. */
function top(values: string[], limit: number): Count[] {
  const groups = new Map<string, Map<string, number>>();
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    const spellings = groups.get(key) ?? new Map<string, number>();
    spellings.set(v, (spellings.get(v) ?? 0) + 1);
    groups.set(key, spellings);
  }
  return [...groups.values()]
    .map((spellings) => {
      const count = [...spellings.values()].reduce((a, b) => a + b, 0);
      const label = [...spellings].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
      return { label, count };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** A venue without its edition year: "CHI '20", "NeurIPS 2017", "ICML (2019)" → "CHI", "NeurIPS", "ICML". */
export function venueName(venue: string): string {
  return venue.replace(/\s*(?:\(\s*(?:19|20)\d{2}\s*\)|['’]\d{2}|(?:19|20)\d{2})\s*$/, '').trim() || venue.trim();
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Authors counted as people ("Vaswani, A." = "Ashish Vaswani"), labelled by their fullest spelling. */
function topAuthors(papers: Paper[], limit: number): Count[] {
  const byKey = new Map<string, { label: string; count: number }>();
  for (const p of papers) {
    // Each paper counts once per person, however often the name repeats.
    const people = new Map<string, string>();
    for (const name of p.authors) {
      const k = authorKey(name);
      if (k && !people.has(k)) people.set(k, name);
    }
    for (const [k, name] of people) {
      const entry = byKey.get(k) ?? { label: name, count: 0 };
      entry.count++;
      if (name.length > entry.label.length) entry.label = name;
      byKey.set(k, entry);
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, limit);
}

export function mapStats(papers: Paper[], limit = 8): MapStats {
  const status: Record<ReadingStatus, number> = { unread: 0, reading: 0, read: 0, skipped: 0 };
  const screening = { include: 0, maybe: 0, exclude: 0, pending: 0 };
  const years = new Map<number, number>();
  for (const p of papers) {
    status[p.status ?? 'unread']++;
    screening[p.screening?.decision ?? 'pending']++;
    if (p.year) years.set(p.year, (years.get(p.year) ?? 0) + 1);
  }
  const cites = papers.map((p) => p.citationCount).filter((c): c is number => c !== undefined);
  return {
    total: papers.length,
    status,
    screening,
    openAccess: papers.filter((p) => p.pdfUrl).length,
    withAbstract: papers.filter((p) => p.abstract.trim()).length,
    citations: { median: median(cites), max: Math.max(0, ...cites), known: cites.length },
    byYear: [...years].sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ year, count })),
    undated: papers.filter((p) => !p.year).length,
    venues: top(papers.map((p) => venueName(p.venue)), limit),
    authors: topAuthors(papers, limit),
    tags: top(papers.flatMap((p) => p.tags ?? []), limit),
    publishers: top(papers.map((p) => p.publisher ?? ''), limit),
    topCited: [...papers].filter((p) => p.citationCount).sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0)).slice(0, 5),
  };
}
