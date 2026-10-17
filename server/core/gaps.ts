import type { GapItem, Paper } from '../../shared/types';
import { splitSentences } from './summarize';

// Stricter than the summary cues: words like "only" are too common to mark a limitation.
const LIMITATION = /\b(limitations?|limited (to|by)|however|drawbacks?|shortcomings?|challenges? (remain|for)|cannot|could not|lacks?|lacking|not (yet|well|fully) (understood|studied|explored|known))\b/i;
const FUTURE = /\b(future (work|research|studies|directions?)|remains? (unclear|open|unknown)|further (research|work|studies)|open (question|problem|challenge)s?|has not been|have not been|is (still )?lacking|little is known)\b/i;

/**
 * Non-LLM gap finder: collect what the papers themselves say is limited or
 * open — the user's challenges/future-work fields and limitation-like
 * sentences in abstracts — grouped by the cluster they belong to.
 */
export function collectStatedGaps(papers: Paper[], groups: Array<{ label: string; paperIds: string[] }>): GapItem[] {
  const groupOf = new Map<string, string>();
  for (const g of groups) for (const id of g.paperIds) if (!groupOf.has(id)) groupOf.set(id, g.label);

  const byGroup = new Map<string, GapItem>();
  const add = (label: string, paperId: string, quote: string) => {
    const item = byGroup.get(label) ?? {
      title: label,
      description: '論文中で課題・限界・今後の展望として述べられている点',
      evidence: [],
      paperIds: [],
      questions: [],
    };
    if (!item.evidence.some((e) => e.paperId === paperId && e.quote === quote)) item.evidence.push({ paperId, quote });
    if (!item.paperIds.includes(paperId)) item.paperIds.push(paperId);
    byGroup.set(label, item);
  };

  for (const p of papers) {
    const label = groupOf.get(p.id) ?? 'その他';
    if (p.challenges?.trim()) add(label, p.id, p.challenges.trim());
    if (p.futureWork?.trim()) add(label, p.id, p.futureWork.trim());
    for (const s of splitSentences(p.abstract ?? '')) {
      if (FUTURE.test(s) || (LIMITATION.test(s) && !/^we (propose|present)/i.test(s))) add(label, p.id, s);
    }
  }
  return [...byGroup.values()].sort((a, b) => b.paperIds.length - a.paperIds.length);
}

/** Clamp model output to papers that exist and drop empty items. */
export function cleanGaps(items: GapItem[], papers: Paper[]): GapItem[] {
  const ids = new Set(papers.map((p) => p.id));
  return items
    .map((g) => ({
      ...g,
      evidence: g.evidence.filter((e) => ids.has(e.paperId)),
      paperIds: [...new Set(g.paperIds.filter((id) => ids.has(id)))],
    }))
    .filter((g) => g.title.trim() && (g.paperIds.length > 0 || g.evidence.length > 0));
}
