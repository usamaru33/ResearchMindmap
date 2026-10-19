import type { Paper } from '../types';

/** One-click exclusion reasons, in the interface language (the chosen text is stored as is). */
export const EXCLUSION_REASONS: Record<'ja' | 'en', string[]> = {
  ja: ['テーマが違う', '研究の種類が違う（レビュー・意見論文など）', '対象・条件が違う', '査読付きでない', '全文が入手できない', '重複'],
  en: ['Off topic', 'Wrong study type (review, opinion, etc.)', 'Wrong population or setting', 'Not peer reviewed', 'Full text unavailable', 'Duplicate'],
};

export interface PrismaCounts {
  total: number;
  screened: number;
  pending: number;
  included: number;
  maybe: number;
  excluded: number;
  /** Exclusion reasons, most frequent first ('理由なし' when none given). */
  reasons: Array<[string, number]>;
  /** Papers by the database they were found in (a paper can count for several). */
  bySource: Array<[string, number]>;
}

export function prismaCounts(papers: Paper[]): PrismaCounts {
  const reasons = new Map<string, number>();
  const sources = new Map<string, number>();
  let included = 0;
  let maybe = 0;
  let excluded = 0;
  for (const p of papers) {
    for (const s of p.sources ?? ['manual']) sources.set(s, (sources.get(s) ?? 0) + 1);
    const d = p.screening?.decision;
    if (d === 'include') included++;
    else if (d === 'maybe') maybe++;
    else if (d === 'exclude') {
      excluded++;
      const r = p.screening?.reason?.trim() || '理由なし';
      reasons.set(r, (reasons.get(r) ?? 0) + 1);
    }
  }
  const sort = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const screened = included + maybe + excluded;
  return {
    total: papers.length,
    screened,
    pending: papers.length - screened,
    included,
    maybe,
    excluded,
    reasons: sort(reasons),
    bySource: sort(sources),
  };
}

/** Screening order: undecided first, then maybe; within each, the existing order. */
export function screeningQueue(papers: Paper[]): Paper[] {
  const rank = (p: Paper) => (!p.screening ? 0 : p.screening.decision === 'maybe' ? 1 : 2);
  return papers.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
}

/** Which papers the screening view walks through; "todo" = not decided yet or maybe. */
export type ScreenFilter = 'todo' | 'pending' | 'include' | 'maybe' | 'exclude' | 'all';

export function matchesFilter(p: Paper, filter: ScreenFilter): boolean {
  const d = p.screening?.decision;
  switch (filter) {
    case 'all':
      return true;
    case 'todo':
      return !d || d === 'maybe';
    case 'pending':
      return !d;
    default:
      return d === filter;
  }
}

/** A PRISMA-style summary block for a methods section. */
export function prismaMarkdown(c: PrismaCounts): string {
  const lines = [
    '**Identification**',
    `- Records identified: ${c.total}${c.bySource.length ? ` (${c.bySource.map(([s, n]) => `${s}: ${n}`).join(', ')})` : ''}`,
    '',
    '**Screening**',
    `- Records screened: ${c.screened}`,
    `- Records excluded: ${c.excluded}`,
    ...c.reasons.map(([r, n]) => `  - ${r}: ${n}`),
    `- Awaiting decision: ${c.pending + c.maybe}${c.maybe ? ` (maybe: ${c.maybe})` : ''}`,
    '',
    '**Included**',
    `- Studies included: ${c.included}`,
  ];
  return lines.join('\n');
}
