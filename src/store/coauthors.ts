import { parseName } from '../../shared/biblio/names';
import type { Paper } from '../types';

export interface AuthorNode {
  key: string;
  /** The fullest spelling seen ("Ashish Vaswani" over "Vaswani, A."). */
  name: string;
  paperIds: string[];
}

export interface CoauthorEdge {
  a: string;
  b: string;
  /** Number of papers written together. */
  weight: number;
}

export interface CoauthorGraph {
  authors: AuthorNode[];
  edges: CoauthorEdge[];
}

const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '')
    .trim();

/** Family name plus first initial, so "Vaswani, A." and "Ashish Vaswani" are one person. */
export function authorKey(raw: string): string {
  // Truncated author lists end in "et al.", which is not a person.
  if (/^(et\.? al\.?|others|and others)$/i.test(raw.trim())) return '';
  const { family, given } = parseName(raw);
  const f = fold(family);
  if (!f) return '';
  const initial = fold(given).charAt(0);
  return initial ? `${f} ${initial}` : f;
}

// Consortium papers list hundreds of authors; they say little about who works with whom.
const MAX_AUTHORS_PER_PAPER = 25;

/**
 * Co-authorship among the most prolific authors of a set of papers.
 * Keeps the top `maxAuthors` by paper count and the edges between them.
 */
export function coauthorGraph(papers: Paper[], maxAuthors = 30): CoauthorGraph {
  const byKey = new Map<string, AuthorNode>();
  const pairs = new Map<string, number>();
  for (const p of papers) {
    if (p.authors.length > MAX_AUTHORS_PER_PAPER) continue;
    const keys: string[] = [];
    for (const raw of p.authors) {
      const key = authorKey(raw);
      if (!key || keys.includes(key)) continue;
      keys.push(key);
      const node = byKey.get(key) ?? { key, name: raw.trim(), paperIds: [] };
      if (raw.trim().length > node.name.length && !raw.includes(',')) node.name = raw.trim();
      node.paperIds.push(p.id);
      byKey.set(key, node);
    }
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const pair = keys[i] < keys[j] ? `${keys[i]}|${keys[j]}` : `${keys[j]}|${keys[i]}`;
        pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
      }
    }
  }
  const authors = [...byKey.values()]
    .sort((x, y) => y.paperIds.length - x.paperIds.length || x.name.localeCompare(y.name))
    .slice(0, maxAuthors);
  const kept = new Set(authors.map((a) => a.key));
  const edges: CoauthorEdge[] = [];
  for (const [pair, weight] of pairs) {
    const [a, b] = pair.split('|');
    if (kept.has(a) && kept.has(b)) edges.push({ a, b, weight });
  }
  edges.sort((x, y) => y.weight - x.weight);
  return { authors, edges };
}

/** Frequent co-authors of one person, most papers together first. */
export function topCoauthors(papers: Paper[], person: string, limit = 10): Array<{ name: string; count: number }> {
  const self = authorKey(person);
  const { authors } = coauthorGraph(
    papers.filter((p) => p.authors.some((a) => authorKey(a) === self)),
    limit + 1,
  );
  return authors
    .filter((a) => a.key !== self)
    .slice(0, limit)
    .map((a) => ({ name: a.name, count: a.paperIds.length }));
}
