import { canonicalId } from './ids';
import type { Paper } from './types';

/** Build a Paper with the mandatory fields defaulted, and a canonical id if none given. */
export function makePaper(partial: Partial<Paper> & Pick<Paper, 'title'>): Paper {
  const year = partial.year ?? 0;
  return {
    authors: [],
    belongs: '',
    venue: '',
    abstract: '',
    challenges: '',
    futureWork: '',
    references: [],
    ...partial,
    year,
    id: partial.id ?? canonicalId(partial.ids ?? {}, partial.title, year),
  };
}

/** Strip HTML/JATS tags and collapse whitespace (abstracts from Crossref/PubMed carry markup). */
export function plainText(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .replace(/<\/?(jats:)?[a-z][^>]*>/gi, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
