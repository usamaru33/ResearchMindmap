import type { Paper } from '../../shared/types';
import { contentTokens } from './textRank';

/** Split an abstract into sentences (keeps "e.g." / "et al." / decimals intact). */
export function splitSentences(text: string): string[] {
  // Hide dots that do not end a sentence behind a private-use character.
  const HOLD = '';
  const protectedText = text
    .replace(/\b(e\.g|i\.e|et al|etc|vs|Fig|Eq|cf)\./gi, (m) => m.replace(/\./g, HOLD))
    .replace(/(\d)\.(\d)/g, `$1${HOLD}$2`);
  return protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"(])/)
    .map((s) => s.split(HOLD).join('.').trim())
    .filter((s) => s.length > 0);
}

// Phrases that usually mark the aim, method, result and limitation of a paper.
const CUES: Array<{ label: string; re: RegExp }> = [
  { label: '目的', re: /\b(we (propose|present|introduce|investigate|study|explore|examine)|this (paper|study|work)|aim|goal|purpose)\b/i },
  { label: '手法', re: /\b(method|approach|framework|model|architecture|experiment|participants|we (use|design|develop|train|conduct))\b/i },
  { label: '結果', re: /\b(results? (show|suggest|indicate|demonstrate)|we (find|found|show|observe)|outperform|significant(ly)?|improv(e|es|ed|ement))\b/i },
  { label: '限界', re: /\b(limitation|however|future work|remain|challenge|cannot|only)\b/i },
];

/**
 * Extractive summary for when no LLM is available: one sentence per cue
 * (aim / method / result / limitation) where found, else the most
 * keyword-dense sentences.
 */
export function extractiveSummary(paper: Paper, maxSentences = 4): string {
  const sentences = splitSentences(paper.abstract ?? '');
  if (sentences.length === 0) return '抄録がないため要約できません。';
  if (sentences.length <= 2) return sentences.map((s) => `- ${s}`).join('\n');

  const used = new Set<number>();
  const lines: string[] = [];
  for (const cue of CUES) {
    const i = sentences.findIndex((s, k) => !used.has(k) && cue.re.test(s));
    if (i >= 0) {
      used.add(i);
      lines.push(`- **${cue.label}**: ${sentences[i]}`);
    }
  }
  if (lines.length < Math.min(maxSentences, sentences.length)) {
    // Fill with sentences that share the most terms with the title.
    const titleTerms = new Set(contentTokens(paper.title));
    const ranked = sentences
      .map((s, i) => ({ i, s, score: contentTokens(s).filter((t) => titleTerms.has(t)).length }))
      .filter((x) => !used.has(x.i))
      .sort((a, b) => b.score - a.score || a.i - b.i);
    for (const r of ranked.slice(0, maxSentences - lines.length)) lines.push(`- ${r.s}`);
  }
  return lines.join('\n');
}
