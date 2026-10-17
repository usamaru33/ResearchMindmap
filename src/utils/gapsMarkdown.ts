import type { GapItem } from '../../shared/types';

/** Research gaps as Markdown for pasting into notes or a draft. */
export function gapsToMarkdown(gaps: GapItem[], titleOf: (id: string) => string): string {
  return gaps
    .map((g) => {
      const lines = [`### ${g.title}`, '', g.description, ''];
      for (const e of g.evidence) lines.push(`- 「${e.quote}」 — ${titleOf(e.paperId)}`);
      if (g.questions.length) {
        lines.push('', '**研究課題の案**');
        for (const q of g.questions) lines.push(`- ${q}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}
