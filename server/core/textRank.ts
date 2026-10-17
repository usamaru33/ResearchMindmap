import { normalizeText, stem } from '../../shared/query';
import type { Paper } from '../../shared/types';

// Common English words that carry no topic (broader than the query stop list).
const STOP = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both
  but by can could did do does doing down during each few for from further had has have having how i if in into is it
  its itself just like me more most my no nor not now of off on once only or other our out over own same should so some
  such than that the their them then there these they this those through to too under until up very was we were what
  when where which while who whom why will with would you your study studies research paper papers work works approach
  method methods using use used based new way ways want looking find whether how does effect effects investigate
  investigating explore exploring examine examining kind something things thing people`.split(/\s+/),
);

export function tokenize(text: string): string[] {
  const norm = normalizeText(text);
  return norm ? norm.split(' ') : [];
}

export function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t));
}

export function hasLatinWords(text: string): boolean {
  return /[a-z]{3,}/i.test(text);
}

/** Keywords and adjacent two-word phrases from free text, in order of appearance. */
export function extractKeywords(text: string): { words: string[]; phrases: string[] } {
  const tokens = tokenize(text);
  const words: string[] = [];
  const phrases: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const keep = t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t);
    if (!keep) continue;
    if (!words.includes(t)) words.push(t);
    const next = tokens[i + 1];
    if (next && next.length >= 3 && !STOP.has(next) && !/^\d+$/.test(next)) {
      const phrase = `${t} ${next}`;
      if (!phrases.includes(phrase)) phrases.push(phrase);
    }
  }
  return { words, phrases };
}

/** Broad RQL queries for when no LLM can expand the description. */
export function fallbackQueries(text: string): string[] {
  const { words, phrases } = extractKeywords(text);
  const queries: string[] = [];
  if (phrases.length) queries.push(phrases.slice(0, 4).map((p) => `"${p}"`).join(' OR '));
  if (words.length) queries.push(words.slice(0, 6).join(' OR '));
  return queries;
}

/**
 * BM25 relevance of each paper (title counted twice) to the query text,
 * normalized to 0–1 over the set. IDF is computed on the candidate set itself.
 */
export function bm25Scores(query: string, papers: Paper[], k1 = 1.2, b = 0.75): number[] {
  const q = [...new Set(contentTokens(query).map(stem))];
  if (q.length === 0 || papers.length === 0) return papers.map(() => 0);
  const docs = papers.map((p) => contentTokens(`${p.title} ${p.title} ${p.abstract ?? ''} ${(p.keywords ?? []).join(' ')}`).map(stem));
  const avg = docs.reduce((n, d) => n + d.length, 0) / docs.length || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length;
  const raw = docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const term of q) {
      const f = tf.get(term) ?? 0;
      if (!f) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg)));
    }
    return score;
  });
  const max = Math.max(...raw);
  return raw.map((s) => (max > 0 ? s / max : 0));
}
