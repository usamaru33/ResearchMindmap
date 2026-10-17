import type { Paper } from '../types';
import { initials, parseName } from './names';

export type CitationStyle = 'apa' | 'ieee' | 'acm';

function doiUrl(p: Paper): string | undefined {
  if (p.ids?.doi) return `https://doi.org/${p.ids.doi}`;
  if (p.ids?.arxiv) return `https://arxiv.org/abs/${p.ids.arxiv}`;
  return p.url;
}

function sentence(text: string): string {
  const t = text.trim();
  return /[.?!]$/.test(t) ? t : `${t}.`;
}

/** APA 7: Family, I. I., Family, I., & Family, I. (Year). Title. Venue. https://doi.org/… */
function apa(p: Paper): string {
  const names = p.authors.map((a) => {
    const n = parseName(a);
    return n.given ? `${n.family}, ${initials(n.given)}` : n.family;
  });
  let authors: string;
  if (names.length === 0) authors = '';
  else if (names.length === 1) authors = names[0];
  else if (names.length <= 20) authors = `${names.slice(0, -1).join(', ')}, & ${names.at(-1)}`;
  else authors = `${names.slice(0, 19).join(', ')}, … ${names.at(-1)}`;
  const parts = [authors ? `${authors} (${p.year || 'n.d.'}).` : `${sentence(p.title)} (${p.year || 'n.d.'}).`];
  if (authors) parts.push(sentence(p.title));
  if (p.venue) parts.push(sentence(p.venue));
  const link = doiUrl(p);
  if (link) parts.push(link);
  return parts.join(' ');
}

/** IEEE: I. Family, I. Family, and I. Family, "Title," in/Venue, Year, doi: … (7+ authors → et al.) */
function ieee(p: Paper): string {
  const names = p.authors.map((a) => {
    const n = parseName(a);
    return n.given ? `${initials(n.given)} ${n.family}` : n.family;
  });
  let authors = '';
  if (names.length > 6) authors = `${names[0]} et al.`;
  else if (names.length === 1) authors = names[0];
  else if (names.length === 2) authors = `${names[0]} and ${names[1]}`;
  else if (names.length > 2) authors = `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
  const conference = /proceedings|conference/i.test(p.type ?? '');
  const venue = p.venue ? `${conference ? 'in ' : ''}${p.venue}, ` : '';
  const tail = p.ids?.doi ? `, doi: ${p.ids.doi}.` : p.ids?.arxiv ? `, arXiv:${p.ids.arxiv}.` : '.';
  return `${authors ? `${authors}, ` : ''}“${p.title},” ${venue}${p.year || 'n.d.'}${tail}`;
}

/** ACM: Given Family, Given Family, and Given Family. Year. Title. In Venue. https://doi.org/… */
function acm(p: Paper): string {
  const names = p.authors.map((a) => {
    const n = parseName(a);
    return n.given ? `${n.given} ${n.family}` : n.family;
  });
  let authors = '';
  if (names.length === 1) authors = names[0];
  else if (names.length === 2) authors = `${names[0]} and ${names[1]}`;
  else if (names.length > 2) authors = `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
  const conference = /proceedings|conference/i.test(p.type ?? '');
  const parts = [authors ? sentence(authors) : '', `${p.year || 'n.d.'}.`, sentence(p.title)];
  if (p.venue) parts.push(sentence(`${conference ? 'In ' : ''}${p.venue}`));
  const link = doiUrl(p);
  if (link) parts.push(link);
  return parts.filter(Boolean).join(' ');
}

export function formatCitation(p: Paper, style: CitationStyle): string {
  switch (style) {
    case 'apa':
      return apa(p);
    case 'ieee':
      return ieee(p);
    case 'acm':
      return acm(p);
  }
}

function csvCell(value: string | number | undefined): string {
  const s = value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Excel needs a byte-order mark to read UTF-8 CSV.
const BOM = String.fromCharCode(0xfeff);

export const CSV_COLUMNS = ['title', 'authors', 'year', 'venue', 'doi', 'arxiv', 'url', 'citations', 'status', 'rating', 'tags', 'notes', 'abstract'] as const;

/** Spreadsheet-friendly CSV (UTF-8 with BOM so Excel detects the encoding). */
export function toCsv(papers: Paper[]): string {
  const rows = papers.map((p) =>
    [
      p.title,
      p.authors.join('; '),
      p.year || '',
      p.venue,
      p.ids?.doi,
      p.ids?.arxiv,
      p.url,
      p.citationCount,
      p.status,
      p.rating || '',
      (p.tags ?? []).join('; '),
      p.notes,
      p.abstract,
    ].map(csvCell).join(','),
  );
  return `${BOM}${[CSV_COLUMNS.join(','), ...rows].join('\r\n')}\r\n`;
}
