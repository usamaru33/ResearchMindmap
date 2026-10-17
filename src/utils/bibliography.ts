import { bibEntryToPaper, parseBibtex, toBibtex } from '../../shared/biblio/bibtex';
import { toCsv } from '../../shared/biblio/formats';
import { parseRis, toRis } from '../../shared/biblio/ris';
import type { Paper } from '../types';
import { downloadText, safeFileName } from './download';

export type ExportFormat = 'bib' | 'ris' | 'csv';

export function exportPapers(papers: Paper[], format: ExportFormat, baseName: string): void {
  const name = `${safeFileName(baseName)}.${format}`;
  if (format === 'bib') downloadText(name, toBibtex(papers), 'application/x-bibtex');
  else if (format === 'ris') downloadText(name, toRis(papers), 'application/x-research-info-systems');
  else downloadText(name, toCsv(papers), 'text/csv');
}

/** Parse a .bib or .ris file (detected from content, so pasted .txt works too). */
export function parseBibliography(text: string): Paper[] {
  if (/^\s*TY {2}-/m.test(text)) return parseRis(text);
  return parseBibtex(text).map(bibEntryToPaper);
}
