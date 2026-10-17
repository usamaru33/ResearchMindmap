import type { Paper } from '../types';

function cell(value: string | number | undefined): string {
  const s = value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The comparison table as CSV (with a BOM for Excel). */
export function comparisonCsv(papers: Paper[], aspects: string[]): string {
  const header = ['title', 'year', 'authors', 'venue', 'doi', ...aspects].map(cell).join(',');
  const rows = papers.map((p) =>
    [p.title, p.year || '', p.authors.join('; '), p.venue, p.ids?.doi, ...aspects.map((a) => p.comparison?.[a] ?? '')].map(cell).join(','),
  );
  return `${String.fromCharCode(0xfeff)}${[header, ...rows].join('\r\n')}\r\n`;
}
