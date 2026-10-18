import { citationKeys } from '../../shared/biblio/bibtex';
import type { Paper } from '../types';

export interface CitationUse {
  key: string;
  /** 1-based line of the citation in the draft. */
  line: number;
}

/** True when the draft looks like LaTeX rather than Markdown. */
export function isLatex(text: string): boolean {
  return /\\(documentclass|begin\{|section\*?\{|[A-Za-z]*cite[A-Za-z]*\*?\s*[[{(])/.test(text);
}

function lineAt(starts: number[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** Blank out spans with spaces so offsets (and line numbers) stay the same. */
function blank(text: string, re: RegExp): string {
  return text.replace(re, (m) => m.replace(/[^\n]/g, ' '));
}

/** `\cite{a,b}`, `\citep[p.~3]{a}`, `\parencite*{a}`, `\cites{a}{b}`, `\nocite{a}` … */
function latexCitations(text: string, starts: number[], out: CitationUse[]) {
  const command = /\\([A-Za-z]*cite[A-Za-z]*)\*?/gi;
  for (const m of text.matchAll(command)) {
    const multi = /cites$/i.test(m[1]);
    let i = m.index + m[0].length;
    for (;;) {
      while (/\s/.test(text[i] ?? '')) i++;
      const open = text[i];
      if (open === '[' || open === '(') {
        const close = text.indexOf(open === '[' ? ']' : ')', i);
        if (close === -1) break;
        i = close + 1;
        continue;
      }
      if (open !== '{') break;
      const close = text.indexOf('}', i);
      if (close === -1) break;
      let offset = i + 1;
      for (const part of text.slice(i + 1, close).split(',')) {
        const key = part.trim();
        if (key && key !== '*') out.push({ key, line: lineAt(starts, offset + part.indexOf(key)) });
        offset += part.length + 1;
      }
      i = close + 1;
      if (!multi) break;
    }
  }
}

// Pandoc citation keys: start with a letter, digit or _, may contain internal punctuation.
const PANDOC_KEY = /(^|[^\w@./])@\{?([A-Za-z0-9_][\w:.#$%&+?<>~/-]*)/g;

/** `[@a; @b, p. 3]`, `[see @a]` and in-text `@a`. Code spans and blocks are skipped. */
function pandocCitations(text: string, starts: number[], out: CitationUse[]) {
  const visible = blank(blank(text, /```[\s\S]*?```|~~~[\s\S]*?~~~/g), /`[^`\n]*`/g);
  for (const m of visible.matchAll(PANDOC_KEY)) {
    const key = m[2].replace(/[:.#$%&+?<>~/-]+$/, '');
    if (key) out.push({ key, line: lineAt(starts, m.index + m[1].length) });
  }
}

/** Every citation in a LaTeX or Markdown (Pandoc) draft, in order. LaTeX comments are ignored. */
export function extractCitations(text: string): CitationUse[] {
  const latex = isLatex(text);
  const source = latex ? blank(text, /(?<!\\)%.*$/gm) : text;
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  const out: CitationUse[] = [];
  latexCitations(source, starts, out);
  if (!latex) pandocCitations(source, starts, out);
  return out.sort((a, b) => a.line - b.line);
}

export interface CitedPaper {
  paper: Paper;
  key: string;
  count: number;
  firstLine: number;
}

export interface UnknownKey {
  key: string;
  count: number;
  firstLine: number;
  /** Keys in the map that look like a typo of this one. */
  suggestions: Array<{ paper: Paper; key: string }>;
}

export interface DraftCheck {
  cited: CitedPaper[];
  unknown: UnknownKey[];
  uncited: Array<{ paper: Paper; key: string }>;
  /** Number of citation occurrences. */
  uses: number;
  /** All map keys, by paper id (the same keys the .bib export uses). */
  keys: Map<string, string>;
}

export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function suggest(key: string, entries: Array<{ paper: Paper; key: string }>) {
  const k = key.toLowerCase();
  // Same "author + year" stem, e.g. vaswani2017 for vaswani2017transformer.
  const stem = k.match(/^[a-z]+\d{4}/)?.[0];
  return entries
    .map((e) => ({ ...e, d: editDistance(k, e.key.toLowerCase()) }))
    .filter((e) => e.d <= Math.max(2, Math.floor(k.length / 5)) || (stem !== undefined && e.key.toLowerCase().startsWith(stem)))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map(({ paper, key: suggested }) => ({ paper, key: suggested }));
}

/** Match a draft's citations against the map's papers. */
export function checkDraft(text: string, papers: Paper[]): DraftCheck {
  const keys = citationKeys(papers);
  const entries = papers.map((paper) => ({ paper, key: keys.get(paper.id)! }));
  const exact = new Map(entries.map((e) => [e.key, e]));
  // BibTeX keys are compared without case; an exact match wins.
  const folded = new Map<string, (typeof entries)[number]>();
  for (const e of entries) if (!folded.has(e.key.toLowerCase())) folded.set(e.key.toLowerCase(), e);

  const uses = extractCitations(text);
  const cited = new Map<string, CitedPaper>();
  const unknown = new Map<string, UnknownKey>();
  for (const use of uses) {
    const hit = exact.get(use.key) ?? folded.get(use.key.toLowerCase());
    if (hit) {
      const c = cited.get(hit.paper.id);
      if (c) c.count++;
      else cited.set(hit.paper.id, { paper: hit.paper, key: hit.key, count: 1, firstLine: use.line });
    } else {
      const u = unknown.get(use.key);
      if (u) u.count++;
      else unknown.set(use.key, { key: use.key, count: 1, firstLine: use.line, suggestions: [] });
    }
  }
  for (const u of unknown.values()) u.suggestions = suggest(u.key, entries);
  return {
    cited: [...cited.values()],
    unknown: [...unknown.values()],
    uncited: entries.filter((e) => !cited.has(e.paper.id)),
    uses: uses.length,
    keys,
  };
}
