import type { Paper } from '../../shared/types';
import { splitSentences } from './summarize';

// Aspects we can fill without an LLM, by the sentence cue that usually carries them.
const KNOWN: Array<{ names: RegExp; cue: RegExp }> = [
  {
    names: /^(method|methods|approach|手法|方法|アプローチ)$/i,
    cue: /\b(we (propose|present|introduce|use|design|develop|train|build)|method|approach|framework|model|architecture)\b/i,
  },
  {
    names: /^(results?|findings?|結果|知見)$/i,
    cue: /\b(results? (show|suggest|indicate|demonstrate)|we (find|found|show|observe)|outperform|significant(ly)?|improv(e|es|ed|ement)|achiev(e|es|ed))\b/i,
  },
  {
    names: /^(aim|goal|purpose|research question|目的|課題設定|問い)$/i,
    cue: /\b(we (investigate|study|explore|examine|ask)|this (paper|study|work)|aim|goal|purpose)\b/i,
  },
  {
    names: /^(limitations?|限界|課題)$/i,
    cue: /\b(limitations?|however|future work|remain|cannot|lack)\b/i,
  },
  {
    names: /^(datasets?|data|データ|データセット)$/i,
    cue: /\b(dataset|corpus|benchmark|participants|subjects|data (from|of|set))\b/i,
  },
  {
    names: /^(evaluation|metrics?|評価|評価指標|評価方法)$/i,
    cue: /\b(evaluat(e|ed|ion)|accuracy|f1|bleu|metric|questionnaire|user study|experiment)\b/i,
  },
];

export function canFillWithoutLlm(aspect: string): boolean {
  return KNOWN.some((k) => k.names.test(aspect.trim()));
}

/** First abstract sentence carrying the aspect's cue, or '' when none. */
export function fillByCue(aspect: string, papers: Paper[]): Record<string, string> {
  const known = KNOWN.find((k) => k.names.test(aspect.trim()));
  const values: Record<string, string> = {};
  if (!known) return values;
  for (const p of papers) {
    const hit = splitSentences(p.abstract ?? '').find((s) => known.cue.test(s));
    values[p.id] = hit ?? '';
  }
  return values;
}
