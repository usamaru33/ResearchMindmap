import { citationKeys } from '../../shared/biblio/bibtex';
import { tr } from '../i18n/current';
import type { Paper } from '../types';
import { statusInfo } from './reading';
import type { ZipEntry } from './zip';

export interface NotesOptions {
  projectName: string;
  /** Comparison-table columns, in order. */
  aspects: string[];
  date: Date;
}

const byYear = (a: Paper, b: Paper) => (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title);

function authorsLine(p: Paper): string {
  return p.authors.length ? p.authors.join(', ') : '—';
}

function links(p: Paper): string[] {
  const out: string[] = [];
  if (p.ids?.doi && !p.ids.doi.startsWith('10.48550/')) out.push(`[doi:${p.ids.doi}](https://doi.org/${p.ids.doi})`);
  if (p.ids?.arxiv) out.push(`[arXiv:${p.ids.arxiv}](https://arxiv.org/abs/${p.ids.arxiv})`);
  if (p.pdfUrl) out.push(`[PDF](${p.pdfUrl})`);
  else if (p.url && !p.ids?.doi) out.push(`[URL](${p.url})`);
  return out;
}

function stars(rating: number | undefined): string {
  return rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '';
}

const quoteBlock = (text: string) =>
  text
    .trim()
    .split(/\r?\n/)
    .map((l) => `> ${l}`)
    .join('\n');

/** The body shared by both formats: metadata lines, comparison cells, notes, abstract. */
function body(p: Paper, key: string, aspects: string[], link: (q: Paper) => string, cites: Paper[], citedBy: Paper[]): string[] {
  const lines: string[] = [];
  // Some venues already carry the year ("NeurIPS 2017").
  const venue = p.year && !p.venue.includes(String(p.year)) ? [p.venue, p.year].filter(Boolean).join(' ') : p.venue;
  lines.push(`- ${tr('notes.authors')}: ${authorsLine(p)}`);
  if (venue) lines.push(`- ${tr('notes.venue')}: ${venue}`);
  const l = links(p);
  if (l.length) lines.push(`- ${tr('notes.links')}: ${l.join(' · ')}`);
  lines.push(`- ${tr('notes.citeKey')}: \`${key}\``);
  const status = statusInfo(p.status ?? 'unread');
  const meta = [status ? tr(status.label) : '', stars(p.rating), (p.tags ?? []).map((t) => `#${t.replace(/\s+/g, '-')}`).join(' ')].filter(Boolean);
  if (meta.length) lines.push(`- ${tr('notes.status')}: ${meta.join(' · ')}`);
  const cells = aspects.filter((a) => p.comparison?.[a]?.trim());
  if (cells.length) {
    lines.push('', `**${tr('notes.comparison')}**`, '');
    for (const a of cells) lines.push(`- ${a}: ${p.comparison![a].trim()}`);
  }
  if (p.notes?.trim()) lines.push('', `**${tr('notes.notes')}**`, '', p.notes.trim());
  if (p.challenges?.trim()) lines.push('', `**${tr('notes.challenges')}**`, '', p.challenges.trim());
  if (p.futureWork?.trim()) lines.push('', `**${tr('notes.futureWork')}**`, '', p.futureWork.trim());
  if (cites.length || citedBy.length) {
    lines.push('', `**${tr('notes.inMap')}**`, '');
    if (cites.length) lines.push(`- ${tr('notes.cites')}: ${cites.map(link).join(', ')}`);
    if (citedBy.length) lines.push(`- ${tr('notes.citedBy')}: ${citedBy.map(link).join(', ')}`);
  }
  if (p.abstract.trim()) lines.push('', `**${tr('notes.abstract')}**`, '', quoteBlock(p.abstract));
  return lines;
}

function citationMaps(papers: Paper[]) {
  const byId = new Map(papers.map((p) => [p.id, p]));
  const citedBy = new Map<string, Paper[]>();
  for (const p of papers) {
    for (const ref of p.references) {
      if (byId.has(ref)) citedBy.set(ref, [...(citedBy.get(ref) ?? []), p]);
    }
  }
  const cites = (p: Paper) => p.references.map((r) => byId.get(r)).filter((q): q is Paper => !!q);
  return { cites, citedBy: (p: Paper) => citedBy.get(p.id) ?? [] };
}

function shortCite(p: Paper): string {
  const first = p.authors[0]?.split(/[ ,]+/).filter(Boolean);
  const family = p.authors[0]?.includes(',') ? first?.[0] : first?.[first.length - 1];
  const who = family ? (p.authors.length > 1 ? `${family} et al.` : family) : '—';
  return `${who} (${p.year || 'n.d.'})`;
}

/** One Markdown file with a section per paper, oldest first. */
export function notesMarkdown(papers: Paper[], opts: NotesOptions): string {
  const keys = citationKeys(papers);
  const sorted = [...papers].sort(byYear);
  const { cites, citedBy } = citationMaps(papers);
  const anchor = (q: Paper) => `${shortCite(q)} ${q.title}`;
  const out = [`# ${tr('notes.title', { name: opts.projectName })}`, '', tr('notes.summary', { n: papers.length, date: opts.date.toISOString().slice(0, 10) })];
  for (const p of sorted) {
    out.push('', `## ${shortCite(p)} ${p.title}`, '');
    out.push(...body(p, keys.get(p.id)!, opts.aspects, anchor, cites(p), citedBy(p)));
  }
  return out.join('\n') + '\n';
}

/** A file name that works on every OS, kept close to the citation key. */
export function noteFileName(key: string): string {
  return key.replace(/[\\/:*?"<>|#^[\]]+/g, '_');
}

const yaml = (s: string) => JSON.stringify(s);

/** An Obsidian folder: one note per paper with front matter and [[links]] between cited papers, plus an index. */
export function obsidianNotes(papers: Paper[], opts: NotesOptions): ZipEntry[] {
  const keys = citationKeys(papers);
  const file = (p: Paper) => noteFileName(keys.get(p.id)!);
  const folder = noteFileName(opts.projectName).trim() || 'literature';
  const sorted = [...papers].sort(byYear);
  const { cites, citedBy } = citationMaps(papers);
  const link = (q: Paper) => `[[${file(q)}|${shortCite(q)}]]`;
  const entries: ZipEntry[] = sorted.map((p) => {
    const front = [
      '---',
      `title: ${yaml(p.title)}`,
      `authors: [${p.authors.map(yaml).join(', ')}]`,
      `year: ${p.year || 'null'}`,
      `citekey: ${yaml(keys.get(p.id)!)}`,
      ...(p.venue ? [`venue: ${yaml(p.venue)}`] : []),
      ...(p.ids?.doi ? [`doi: ${yaml(p.ids.doi)}`] : []),
      `status: ${p.status ?? 'unread'}`,
      ...(p.rating ? [`rating: ${p.rating}`] : []),
      `tags: [${(p.tags ?? []).map((t) => yaml(t.replace(/\s+/g, '-'))).join(', ')}]`,
      '---',
    ];
    const content = [...front, '', `# ${p.title}`, '', ...body(p, keys.get(p.id)!, opts.aspects, link, cites(p), citedBy(p))].join('\n') + '\n';
    return { name: `${folder}/${file(p)}.md`, content };
  });
  const index = [`# ${tr('notes.title', { name: opts.projectName })}`, '', tr('notes.summary', { n: papers.length, date: opts.date.toISOString().slice(0, 10) }), ''];
  for (const p of sorted) index.push(`- ${link(p)} ${p.title}`);
  entries.unshift({ name: `${folder}/_index.md`, content: index.join('\n') + '\n' });
  return entries;
}
