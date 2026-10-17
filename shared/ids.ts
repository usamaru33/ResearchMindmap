import type { ExternalIds } from './types';

/** `https://doi.org/10.1145/ABC` → `10.1145/abc`. Returns undefined for non-DOIs. */
export function normalizeDoi(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const m = raw.trim().match(/(10\.\d{4,9}\/[^\s"<>]+)/i);
  return m ? m[1].replace(/[.,;]+$/, '').toLowerCase() : undefined;
}

/** `arXiv:1706.03762v7` / `https://arxiv.org/abs/1706.03762v7` → `1706.03762`. */
export function normalizeArxivId(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  const modern = s.match(/(\d{4}\.\d{4,5})(v\d+)?/);
  if (modern) return modern[1];
  const legacy = s.match(/([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?/i);
  return legacy ? legacy[1].toLowerCase() : undefined;
}

/** `https://openalex.org/W2626778328` → `W2626778328`. */
export function normalizeOpenAlexId(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/(W\d+)/i);
  return m ? m[1].toUpperCase() : undefined;
}

/** Lower-case, strip accents/punctuation/markup — for comparing titles across sources. */
export function normalizeTitle(title: string): string {
  return title
    .replace(/<[^>]+>/g, ' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Stable paper id, preferring the most universal identifier.
 * See docs/DESIGN.md §4.2.
 */
export function canonicalId(ids: ExternalIds, title: string, year: number): string {
  if (ids.doi) return `doi:${ids.doi}`;
  if (ids.arxiv) return `arxiv:${ids.arxiv}`;
  if (ids.openalex) return `openalex:${ids.openalex}`;
  if (ids.s2) return `s2:${ids.s2}`;
  if (ids.pmid) return `pmid:${ids.pmid}`;
  if (ids.ieee) return `ieee:${ids.ieee}`;
  if (ids.dblp) return `dblp:${ids.dblp}`;
  return `title:${normalizeTitle(title).slice(0, 120)}:${year || 0}`;
}

/** arXiv DOIs (10.48550/arXiv.XXXX) carry the arXiv id. */
export function arxivIdFromDoi(doi: string | undefined): string | undefined {
  if (!doi) return undefined;
  const m = doi.match(/^10\.48550\/arxiv\.(.+)$/i);
  return m ? normalizeArxivId(m[1]) : undefined;
}
