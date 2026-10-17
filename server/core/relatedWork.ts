import { citationKeys } from '../../shared/biblio/bibtex';
import { parseName } from '../../shared/biblio/names';
import type { Paper } from '../../shared/types';
import { splitSentences } from './summarize';

export interface DraftGroup {
  label: string;
  paperIds: string[];
}

export interface DraftInput {
  papers: Paper[];
  groups: DraftGroup[];
  topic: string;
  lang: 'ja' | 'en';
}

/** Groups in input order, each paper once; papers not in any group go to a final "Other" group. */
export function normalizeGroups(papers: Paper[], groups: DraftGroup[]): DraftGroup[] {
  const ids = new Set(papers.map((p) => p.id));
  const seen = new Set<string>();
  const out: DraftGroup[] = [];
  for (const g of groups) {
    const members = g.paperIds.filter((id) => ids.has(id) && !seen.has(id));
    members.forEach((id) => seen.add(id));
    if (members.length) out.push({ label: g.label, paperIds: members });
  }
  const rest = papers.filter((p) => !seen.has(p.id)).map((p) => p.id);
  if (rest.length) out.push({ label: out.length ? 'Other' : 'Related work', paperIds: rest });
  return out;
}

function shortAuthors(p: Paper): string {
  const fam = p.authors.map((a) => parseName(a).family).filter(Boolean);
  if (fam.length === 0) return 'Anonymous';
  if (fam.length === 1) return fam[0];
  if (fam.length === 2) return `${fam[0]} and ${fam[1]}`;
  return `${fam[0]} et al.`;
}

/** The paper list Claude writes from: one block per group, with citation keys. */
export function papersBlock(input: DraftInput): { text: string; keys: Map<string, string> } {
  const keys = citationKeys(input.papers);
  const byId = new Map(input.papers.map((p) => [p.id, p]));
  const parts = normalizeGroups(input.papers, input.groups).map((g) => {
    const items = g.paperIds.map((id) => {
      const p = byId.get(id)!;
      const abstract = (p.abstract ?? '').slice(0, 900);
      return `[${keys.get(id)}] ${shortAuthors(p)} (${p.year || 'n.d.'}). ${p.title}.${p.venue ? ` ${p.venue}.` : ''}\n${abstract || '(no abstract)'}${p.notes ? `\nReader's notes: ${p.notes.slice(0, 400)}` : ''}`;
    });
    return `## ${g.label}\n\n${items.join('\n\n')}`;
  });
  return { text: parts.join('\n\n'), keys };
}

/**
 * A structured outline to start writing from when no LLM is available:
 * one subsection per group, one line per paper with its key and first sentence.
 */
export function templateDraft(input: DraftInput): string {
  const keys = citationKeys(input.papers);
  const byId = new Map(input.papers.map((p) => [p.id, p]));
  const ja = input.lang === 'ja';
  const lines: string[] = [ja ? '## 関連研究' : '## Related Work', ''];
  if (input.topic.trim()) {
    lines.push(ja ? `本研究（${input.topic.trim()}）に関連する研究を、以下の観点から整理する。` : `We review work related to ${input.topic.trim()} along the following lines.`, '');
  }
  for (const g of normalizeGroups(input.papers, input.groups)) {
    lines.push(`### ${g.label}`, '');
    const papers = g.paperIds.map((id) => byId.get(id)!).sort((a, b) => (a.year || 0) - (b.year || 0));
    for (const p of papers) {
      const first = splitSentences(p.abstract ?? '')[0] ?? p.title;
      lines.push(`- ${shortAuthors(p)} [${keys.get(p.id)}] (${p.year || 'n.d.'}): ${first}`);
    }
    lines.push('', ja ? '> ここに、この節の研究の共通点・違い・本研究との関係を書く。' : '> Summarize what these works share, how they differ, and how ours relates.', '');
  }
  return lines.join('\n').trimEnd() + '\n';
}
