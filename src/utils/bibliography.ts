import { bibEntryToPaper, parseBibtex, toBibtex } from '../../shared/biblio/bibtex';
import { toCsv } from '../../shared/biblio/formats';
import { parseRis, toRis } from '../../shared/biblio/ris';
import type { Paper } from '../types';
import { downloadBytes, downloadText, safeFileName } from './download';
import { notesMarkdown, obsidianNotes } from './notesMarkdown';
import { makeZip } from './zip';

export type ExportFormat = 'bib' | 'ris' | 'csv';

export function exportPapers(papers: Paper[], format: ExportFormat, baseName: string): void {
  const name = `${safeFileName(baseName)}.${format}`;
  if (format === 'bib') downloadText(name, toBibtex(papers), 'application/x-bibtex');
  else if (format === 'ris') downloadText(name, toRis(papers), 'application/x-research-info-systems');
  else downloadText(name, toCsv(papers), 'text/csv');
}

export type NotesFormat = 'md' | 'obsidian';

/** Literature notes: one Markdown file, or a zip of Obsidian notes. */
export function exportNotes(papers: Paper[], format: NotesFormat, projectName: string, aspects: string[]): void {
  const opts = { projectName, aspects, date: new Date() };
  const base = `${safeFileName(projectName)}-notes`;
  if (format === 'md') downloadText(`${base}.md`, notesMarkdown(papers, opts), 'text/markdown');
  else downloadBytes(`${base}.zip`, makeZip(obsidianNotes(papers, opts)), 'application/zip');
}

/** Parse a .bib or .ris file (detected from content, so pasted .txt works too). */
export function parseBibliography(text: string): Paper[] {
  if (/^\s*TY {2}-/m.test(text)) return parseRis(text);
  return parseBibtex(text).map(bibEntryToPaper);
}
