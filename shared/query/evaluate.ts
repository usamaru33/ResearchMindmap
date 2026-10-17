import type { Paper } from '../types';
import type { ParsedQuery, QueryFilters, QueryNode, TermNode, TextField } from './ast';
import { publisherFromDoi } from './fields';

/** Lower-case, strip accents and punctuation, collapse spaces. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Very small stemmer: enough to match plurals and common verb forms. */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('es') && /(?:ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) {
    return word.slice(0, -1);
  }
  return word;
}

interface FieldIndex {
  words: string[];
  stems: string[];
  text: string;
}

function index(text: string): FieldIndex {
  const norm = normalizeText(text);
  const words = norm ? norm.split(' ') : [];
  return { words, stems: words.map(stem), text: ` ${norm} ` };
}

function paperFields(paper: Paper): Record<TextField, FieldIndex> {
  const keywords = [...(paper.keywords ?? []), ...(paper.topics ?? []).map((t) => t.name)].join(' ; ');
  const title = paper.title ?? '';
  const abstract = paper.abstract ?? '';
  const authors = (paper.authors ?? []).join(' ; ');
  const venue = paper.venue ?? '';
  return {
    title: index(title),
    abstract: index(abstract),
    tiab: index(`${title} ; ${abstract} ; ${keywords}`),
    author: index(authors),
    venue: index(venue),
    keyword: index(keywords),
    all: index(`${title} ; ${abstract} ; ${keywords} ; ${authors} ; ${venue}`),
  };
}

function matchTerm(term: TermNode, f: FieldIndex): boolean {
  const words = normalizeText(term.value).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  if (words.length === 1 && !term.phrase) {
    const w = words[0];
    if (term.wildcard) return f.words.some((x) => x.startsWith(w));
    const s = stem(w);
    return f.stems.includes(s);
  }
  // Phrase (or multi-word unquoted value): consecutive stems.
  const target = words.map(stem);
  for (let i = 0; i + target.length <= f.stems.length; i++) {
    const ok = target.every((t, k) =>
      term.wildcard && k === target.length - 1
        ? f.words[i + k].startsWith(words[k])
        : f.stems[i + k] === t,
    );
    if (ok) return true;
  }
  return false;
}

export function matchesNode(node: QueryNode, fields: Record<TextField, FieldIndex>): boolean {
  switch (node.type) {
    case 'term':
      return matchTerm(node, fields[node.field]);
    case 'and':
      return node.children.every((c) => matchesNode(c, fields));
    case 'or':
      return node.children.some((c) => matchesNode(c, fields));
    case 'not':
      return !matchesNode(node.child, fields);
  }
}

export function paperPublisher(paper: Paper): string | undefined {
  return paper.publisher?.toLowerCase() ?? publisherFromDoi(paper.ids?.doi);
}

export function matchesFilters(filters: QueryFilters, paper: Paper): boolean {
  if (filters.yearMin !== undefined && !(paper.year >= filters.yearMin)) return false;
  if (filters.yearMax !== undefined && !(paper.year <= filters.yearMax)) return false;
  if (filters.publishers.length > 0) {
    const pub = paperPublisher(paper);
    if (!pub || !filters.publishers.includes(pub)) return false;
  }
  if (filters.openAccess === true && !paper.pdfUrl) return false;
  if (filters.types.length > 0 && paper.type && !filters.types.some((t) => paper.type!.toLowerCase().includes(t))) {
    return false;
  }
  return true;
}

/** Evaluate a parsed query against a paper's metadata (used to post-filter approximate sources). */
export function matchesQuery(query: ParsedQuery, paper: Paper): boolean {
  if (!matchesFilters(query.filters, paper)) return false;
  return query.text ? matchesNode(query.text, paperFields(paper)) : true;
}

export interface CollectedTerm {
  term: TermNode;
  negated: boolean;
}

/** Flatten all terms with their polarity (inside an odd number of NOTs → negated). */
export function collectTerms(node: QueryNode | null, negated = false): CollectedTerm[] {
  if (!node) return [];
  switch (node.type) {
    case 'term':
      return [{ term: node, negated }];
    case 'not':
      return collectTerms(node.child, !negated);
    case 'and':
    case 'or':
      return node.children.flatMap((c) => collectTerms(c, negated));
  }
}
