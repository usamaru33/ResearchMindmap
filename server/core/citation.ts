import { asciiFamily } from '../../shared/biblio/names';
import { normalizeTitle } from '../../shared/ids';
import type { Paper } from '../../shared/types';

/** A free-text reference ("A. Vaswani et al., "Attention…," in Proc. NeurIPS, 2017.") rather than a bare title. */
export function looksLikeCitation(s: string): boolean {
  if (s.length < 30) return false;
  const year = /\b(19|20)\d{2}[a-z]?\b/.test(s);
  const punctuation = (s.match(/[,.;:]/g) ?? []).length;
  return year && punctuation >= 3;
}

/** Years mentioned in the reference (publication year candidates). */
export function citationYears(s: string): number[] {
  return [...new Set([...s.matchAll(/(?<![\d.])((?:19|20)\d{2})[a-z]?(?![\d])/g)].map((m) => Number(m[1])))];
}

const AUTHORISH = /^(?:[\p{Lu}][\p{L}'’-]+,?\s+(?:[\p{Lu}]\.?\s?-?){1,3},?\s*|[\p{Lu}]\.\s?(?:[\p{Lu}]\.\s?)*[\p{Lu}][\p{L}'’-]+,?\s*|and\s|&\s|et al\.?,?\s*)+$/u;

/**
 * Likely titles inside a reference, best first: a quoted title (IEEE), the sentence
 * after "(2016)." or "2016." (APA, ACM), then the longest sentence that is not a list of names.
 */
export function titleGuesses(s: string): string[] {
  const out: string[] = [];
  const quoted = s.match(/[“"]([^”"]{12,})[”"]/);
  if (quoted) out.push(quoted[1].replace(/[,.]\s*$/, ''));
  const afterYear = s.match(/(?:\((?:19|20)\d{2}[a-z]?\)|\b(?:19|20)\d{2}[a-z]?)\.\s+(.+?[^\s.A-Z])[.?!](?:\s|$)/);
  if (afterYear) out.push(afterYear[1]);
  // Vancouver: "Botvinick M, Cohen J. Title. Journal. 1998;…"
  const vancouver = s.match(/^(?:\p{Lu}[\p{L}'’-]+\s\p{Lu}{1,3},\s*)*(?:\p{Lu}[\p{L}'’-]+\s\p{Lu}{1,3}|et al)\.\s+(.+?[^\s.A-Z])[.?!]\s/u);
  if (vancouver) out.push(vancouver[1]);
  const sentences = s
    .split(/(?<=[^\s.][a-z\d)?!])[.?!]\s+/)
    .map((x) => x.trim())
    .filter((x) => x.split(/\s+/).length >= 3 && !AUTHORISH.test(x) && !/^(in|proc|pp|vol|doi|https?)\b/i.test(x));
  sentences.sort((a, b) => b.length - a.length);
  if (sentences[0]) out.push(sentences[0]);
  return [...new Set(out.map((t) => t.trim()).filter((t) => t.split(/\s+/).length >= 2))];
}

export type Confidence = 'high' | 'low';

export interface CitationScore {
  confidence: Confidence | null;
  /** Share of the candidate's title words that appear in the reference. */
  coverage: number;
  yearOk: boolean;
  authorOk: boolean;
}

/** How well a found paper matches a free-text reference. */
export function scoreCandidate(citation: string, paper: Paper): CitationScore {
  const words = new Set(normalizeTitle(citation).split(' '));
  const title = normalizeTitle(paper.title).split(' ').filter(Boolean);
  const coverage = title.length ? title.filter((w) => words.has(w)).length / title.length : 0;
  const years = citationYears(citation);
  const yearOk = years.length === 0 || (paper.year > 0 && years.some((y) => Math.abs(y - paper.year) <= 1));
  const family = paper.authors[0] ? asciiFamily(paper.authors[0]).toLowerCase() : '';
  const plain = normalizeTitle(citation.normalize('NFKD').replace(/[̀-ͯ]/g, ''));
  const authorOk = !family || plain.split(' ').includes(family);
  const titleOk = coverage >= 0.85 && title.length >= 3;
  const confidence: Confidence | null = !titleOk ? null : yearOk && authorOk ? 'high' : yearOk || authorOk ? 'low' : null;
  return { confidence, coverage, yearOk, authorOk };
}

/** The best-matching candidate, or null when none is plausible. */
export function bestMatch(citation: string, candidates: Paper[]): { paper: Paper; score: CitationScore } | null {
  const rank = (c: Confidence | null) => (c === 'high' ? 2 : c === 'low' ? 1 : 0);
  let best: { paper: Paper; score: CitationScore } | null = null;
  for (const paper of candidates) {
    const score = scoreCandidate(citation, paper);
    if (!score.confidence) continue;
    if (
      !best ||
      rank(score.confidence) > rank(best.score.confidence) ||
      (rank(score.confidence) === rank(best.score.confidence) &&
        (score.coverage > best.score.coverage ||
          (score.coverage === best.score.coverage && (paper.citationCount ?? 0) > (best.paper.citationCount ?? 0))))
    ) {
      best = { paper, score };
    }
  }
  return best;
}
