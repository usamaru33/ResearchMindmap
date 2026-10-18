import type { RecommendReason } from '../../shared/types';
import type { Translate } from '../i18n';
import type { Paper } from '../types';

const STATUS_WEIGHT: Record<string, number> = { read: 2, reading: 1 };

/**
 * Papers to recommend from: only those OpenAlex can locate (OpenAlex id, DOI
 * or arXiv id), preferring what the user rated, read, and what is widely cited.
 */
export function pickSeeds(papers: Paper[], max: number): Paper[] {
  return papers
    .filter((p) => p.ids?.openalex || p.ids?.doi || p.ids?.arxiv)
    .map((p) => ({ p, score: (p.rating ?? 0) * 10 + (STATUS_WEIGHT[p.status ?? ''] ?? 0) * 5 + Math.log10(1 + (p.citationCount ?? 0)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.p);
}

/** "cited by 3 on the map · related to 2" */
export function reasonText(r: RecommendReason, t: Translate): string {
  const parts: string[] = [];
  if (r.cocited) parts.push(t('rec.reason.cocited', { n: r.cocited }));
  if (r.citing) parts.push(t('rec.reason.citing', { n: r.citing }));
  if (r.related) parts.push(t('rec.reason.related', { n: r.related }));
  return parts.join(' · ');
}
