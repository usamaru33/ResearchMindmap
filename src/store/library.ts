import { normalizeText } from '../../shared/query';
import type { Paper, ReadingStatus } from '../../shared/types';

export type SortKey = 'added' | 'year' | 'title' | 'citations' | 'rating' | 'status';
export type SortDir = 'asc' | 'desc';

export interface LibraryFilters {
  text: string;
  status: ReadingStatus | 'all';
  tag: string | null;
}

export const EMPTY_FILTERS: LibraryFilters = { text: '', status: 'all', tag: null };

const STATUS_ORDER: Record<ReadingStatus, number> = { reading: 0, unread: 1, read: 2, skipped: 3 };

/** Case/accent-insensitive search over title, authors, venue, tags and notes. */
export function filterPapers(papers: Paper[], f: LibraryFilters): Paper[] {
  const words = normalizeText(f.text).split(' ').filter(Boolean);
  return papers.filter((p) => {
    if (f.status !== 'all' && (p.status ?? 'unread') !== f.status) return false;
    if (f.tag && !(p.tags ?? []).includes(f.tag)) return false;
    if (words.length === 0) return true;
    const hay = normalizeText([p.title, p.authors.join(' '), p.venue, (p.tags ?? []).join(' '), p.notes ?? ''].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

export function sortPapers(papers: Paper[], key: SortKey, dir: SortDir): Paper[] {
  const sign = dir === 'asc' ? 1 : -1;
  const value = (p: Paper): number | string => {
    switch (key) {
      case 'added':
        return p.addedAt ?? '';
      case 'year':
        return p.year || 0;
      case 'title':
        return p.title.toLowerCase();
      case 'citations':
        return p.citationCount ?? -1;
      case 'rating':
        return p.rating ?? 0;
      case 'status':
        return STATUS_ORDER[p.status ?? 'unread'];
    }
  };
  return [...papers].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va < vb) return -sign;
    if (va > vb) return sign;
    return a.title.localeCompare(b.title);
  });
}
