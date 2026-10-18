import { normalizeText } from '../../shared/query';
import { makeTranslate, type Lang, type MessageKey } from '../i18n';
import type { Vars } from '../i18n/format';

export interface PaletteItem {
  id: string;
  kind: 'command' | 'paper';
  /** Shown in the list. */
  label: string;
  /** Second line (authors and year for papers, the shortcut for commands). */
  detail?: string;
  /** Extra text matched but not shown (the command's name in the other language, a paper's authors). */
  keywords?: string;
}

/**
 * How well an item matches the typed words: every word must appear somewhere
 * (case, accents and full-/half-width ignored). Lower is better; null = no match.
 * Matches at the start of the label, or of a word in it, rank first.
 */
export function matchScore(query: string, item: PaletteItem): number | null {
  const words = normalizeText(query).split(' ').filter(Boolean);
  if (words.length === 0) return 0;
  const label = normalizeText(item.label);
  const all = `${label} ${normalizeText(item.detail ?? '')} ${normalizeText(item.keywords ?? '')}`;
  let score = 0;
  for (const w of words) {
    const inLabel = label.indexOf(w);
    if (inLabel === 0) continue;
    if (inLabel > 0) {
      score += label[inLabel - 1] === ' ' ? 1 : 2;
      continue;
    }
    if (!all.includes(w)) return null;
    score += 4;
  }
  return score;
}

/** Matching items, best first; ties keep their given order (commands before papers). */
export function rankItems(items: PaletteItem[], query: string, limitPerKind = 8): PaletteItem[] {
  const scored = items
    .map((item, i) => ({ item, i, s: matchScore(query, item) }))
    .filter((x): x is { item: PaletteItem; i: number; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || a.i - b.i);
  const counts = { command: 0, paper: 0 };
  const out: PaletteItem[] = [];
  for (const { item } of scored) {
    if (counts[item.kind] >= limitPerKind) continue;
    counts[item.kind]++;
    out.push(item);
  }
  // Commands first, then papers, each in score order.
  return [...out.filter((x) => x.kind === 'command'), ...out.filter((x) => x.kind === 'paper')];
}

/** A command's name in the UI language, and in the other language as search keywords. */
export function bilingual(key: MessageKey, lang: Lang, vars?: Vars): { label: string; keywords: string } {
  return { label: makeTranslate(lang)(key, vars), keywords: makeTranslate(lang === 'ja' ? 'en' : 'ja')(key, vars) };
}
