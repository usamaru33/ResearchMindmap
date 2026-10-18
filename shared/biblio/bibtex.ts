import { normalizeArxivId, normalizeDoi } from '../ids';
import { makePaper } from '../paper';
import { publisherFromDoi } from '../query';
import type { Paper } from '../types';
import { asciiFamily, parseName } from './names';

const STOP = new Set(['a', 'an', 'the', 'on', 'of', 'in', 'for', 'and', 'to', 'with', 'towards', 'toward']);

/**
 * e.g. vaswani2017attention; collisions get a, b, c… suffixes.
 * A key kept from an imported entry (`citeKey`) is used as is, and generated keys avoid it.
 */
export function citationKeys(papers: Paper[]): Map<string, string> {
  const keys = new Map<string, string>();
  const used = new Map<string, number>();
  const taken = new Set<string>();
  for (const p of papers) {
    if (p.citeKey && !taken.has(p.citeKey)) {
      keys.set(p.id, p.citeKey);
      taken.add(p.citeKey);
    }
  }
  for (const p of papers) {
    if (keys.has(p.id)) continue;
    const family = (p.authors[0] ? asciiFamily(p.authors[0]) : 'anon').toLowerCase() || 'anon';
    const word =
      p.title
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .find((w) => w && !STOP.has(w)) ?? 'untitled';
    const base = `${family}${p.year || 'nd'}${word}`;
    let n = used.get(base) ?? 0;
    const keyFor = (i: number) => (i === 0 ? base : `${base}${String.fromCharCode(96 + i)}`);
    while (taken.has(keyFor(n))) n++;
    used.set(base, n + 1);
    taken.add(keyFor(n));
    keys.set(p.id, keyFor(n));
  }
  // In the papers' order.
  return new Map(papers.map((p) => [p.id, keys.get(p.id)!]));
}

const SPECIAL = /([&%$#_])/g;

function escape(value: string): string {
  return value.replace(/\\/g, '\\textbackslash{}').replace(SPECIAL, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
}

function entryType(p: Paper): 'article' | 'inproceedings' | 'misc' | 'book' | 'incollection' {
  const t = (p.type ?? '').toLowerCase();
  if (t.includes('proceedings') || t.includes('conference')) return 'inproceedings';
  if (t === 'book') return 'book';
  if (t.includes('chapter')) return 'incollection';
  if (t === 'preprint' || (!p.venue && p.ids?.arxiv) || /^arxiv/i.test(p.venue)) return 'misc';
  return p.venue ? 'article' : 'misc';
}

export function bibtexAuthors(authors: string[]): string {
  return authors
    .map((a) => {
      const n = parseName(a);
      return n.given ? `${n.family}, ${n.given}` : n.family;
    })
    .join(' and ');
}

export function toBibtexEntry(p: Paper, key: string): string {
  const type = entryType(p);
  const fields: Array<[string, string]> = [];
  // Double braces keep capitalization ("BERT", "Transformer") as written.
  fields.push(['title', `{${escape(p.title)}}`]);
  if (p.authors.length) fields.push(['author', escape(bibtexAuthors(p.authors))]);
  if (p.year) fields.push(['year', String(p.year)]);
  if (p.venue && type !== 'misc') fields.push([type === 'inproceedings' || type === 'incollection' ? 'booktitle' : 'journal', escape(p.venue)]);
  if (p.ids?.doi && !p.ids.doi.startsWith('10.48550/')) fields.push(['doi', p.ids.doi]);
  if (p.ids?.arxiv) {
    fields.push(['eprint', p.ids.arxiv]);
    fields.push(['archiveprefix', 'arXiv']);
  }
  if (p.url) fields.push(['url', p.url]);
  if (p.abstract) fields.push(['abstract', escape(p.abstract)]);
  if (p.keywords?.length || p.tags?.length) fields.push(['keywords', escape([...(p.tags ?? []), ...(p.keywords ?? [])].join(', '))]);
  if (p.notes) fields.push(['note', escape(p.notes)]);
  const body = fields.map(([k, v]) => `  ${k} = {${v}}`).join(',\n');
  return `@${type}{${key},\n${body}\n}`;
}

/** `keys` overrides the generated keys (e.g. to match keys computed over a larger set). */
export function toBibtex(papers: Paper[], keys: Map<string, string> = citationKeys(papers)): string {
  return papers.map((p) => toBibtexEntry(p, keys.get(p.id)!)).join('\n\n') + '\n';
}

// ---- parsing --------------------------------------------------------------

export interface BibEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

function unescape(value: string): string {
  return value
    .replace(/\\textbackslash\{\}/g, '\\')
    .replace(/\\textasciitilde\{\}/g, '~')
    .replace(/\\textasciicircum\{\}/g, '^')
    .replace(/\\([&%$#_{}])/g, '$1')
    .replace(/\\["'`^~=.]\{?([A-Za-z])\}?/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tolerant BibTeX reader: @type{key, field = {…} | "…" | number, …}. @comment/@preamble/@string are skipped. */
export function parseBibtex(text: string): BibEntry[] {
  const entries: BibEntry[] = [];
  let i = 0;
  while (true) {
    const at = text.indexOf('@', i);
    if (at === -1) break;
    const m = /^@\s*([A-Za-z]+)\s*([{(])/.exec(text.slice(at));
    if (!m) {
      i = at + 1;
      continue;
    }
    const type = m[1].toLowerCase();
    const close = m[2] === '{' ? '}' : ')';
    let j = at + m[0].length;
    if (['comment', 'preamble', 'string'].includes(type)) {
      let depth = 1;
      while (j < text.length && depth > 0) {
        if (text[j] === m[2]) depth++;
        else if (text[j] === close) depth--;
        j++;
      }
      i = j;
      continue;
    }
    const keyEnd = text.indexOf(',', j);
    if (keyEnd === -1) break;
    const key = text.slice(j, keyEnd).trim();
    j = keyEnd + 1;
    const fields: Record<string, string> = {};
    for (;;) {
      while (j < text.length && /[\s,]/.test(text[j])) j++;
      if (j >= text.length || text[j] === close) {
        j++;
        break;
      }
      const name = /^([A-Za-z][\w-]*)\s*=\s*/.exec(text.slice(j));
      if (!name) {
        // Malformed field: skip to the next comma or the end of the entry.
        while (j < text.length && text[j] !== ',' && text[j] !== close) j++;
        continue;
      }
      j += name[0].length;
      let value = '';
      if (text[j] === '{') {
        let depth = 0;
        const start = j;
        for (; j < text.length; j++) {
          if (text[j] === '{' && text[j - 1] !== '\\') depth++;
          else if (text[j] === '}' && text[j - 1] !== '\\') {
            depth--;
            if (depth === 0) break;
          }
        }
        value = text.slice(start + 1, j);
        j++;
      } else if (text[j] === '"') {
        const start = ++j;
        while (j < text.length && !(text[j] === '"' && text[j - 1] !== '\\')) j++;
        value = text.slice(start, j);
        j++;
      } else {
        const start = j;
        while (j < text.length && /[^,}\s)]/.test(text[j])) j++;
        value = text.slice(start, j);
      }
      fields[name[1].toLowerCase()] = unescape(value);
    }
    entries.push({ type, key, fields });
    i = j;
  }
  return entries;
}

export function bibEntryToPaper(e: BibEntry): Paper {
  const f = e.fields;
  const doi = normalizeDoi(f.doi ?? '');
  const arxiv = normalizeArxivId(f.eprint && /arxiv/i.test(f.archiveprefix ?? f.eprinttype ?? 'arxiv') ? f.eprint : '');
  const authors = (f.author ?? '')
    .split(/\s+and\s+/i)
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      const n = parseName(a);
      return n.given ? `${n.given} ${n.family}` : n.family;
    });
  const keywords = (f.keywords ?? '').split(/[,;]/).map((k) => k.trim()).filter(Boolean);
  const type = e.type === 'inproceedings' || e.type === 'conference' ? 'proceedings-article' : e.type === 'article' ? 'journal-article' : e.type === 'misc' && arxiv ? 'preprint' : e.type;
  return makePaper({
    title: f.title ?? '(untitled)',
    authors,
    year: Number((f.year ?? f.date ?? '').slice(0, 4)) || 0,
    venue: f.journal ?? f.booktitle ?? f.journaltitle ?? (arxiv ? 'arXiv' : f.publisher ?? ''),
    abstract: f.abstract ?? '',
    notes: f.note,
    keywords: keywords.length ? keywords : undefined,
    ids: { doi, arxiv },
    url: f.url,
    publisher: publisherFromDoi(doi),
    type,
    citeKey: e.key || undefined,
  });
}
