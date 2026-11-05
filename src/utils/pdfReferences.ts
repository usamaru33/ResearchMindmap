// Finding the reference list in the text of a PDF. No PDF library here: the
// text comes in as lines, so this stays testable.

export interface TextItem {
  str: string;
  hasEOL?: boolean;
}

/** Heading of the list, with an optional section number: "7 References", "VII. REFERENCES". */
const HEADING = /^(?:(?:\d{1,2}|[IVX]{1,5})[.)]?\s+)?(?:references|bibliography|works cited|literature cited|参考文献|引用文献)\s*:?$/i;
// A section that follows the list (kept short so a sentence that starts with "Appendix" is not a heading).
const AFTER_LIST = /^(?:[A-Z][.)]?\s+)?(?:appendix|appendices|supplementary (?:material|information)|付録)\b/i;
const PAGE_NUMBER = /^\d{1,4}$/;

/** Lines of one page from pdf.js text items: a line ends where an item says so. */
export function itemsToLines(items: TextItem[]): string[] {
  const lines: string[] = [];
  let current = '';
  for (const item of items) {
    current += item.str;
    if (item.hasEOL) {
      lines.push(current);
      current = '';
    }
  }
  if (current) lines.push(current);
  return lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export type ReferencesResult = { ok: true; text: string; lines: number } | { ok: false; reason: 'no-text' | 'no-heading' };

/**
 * The text after the last "References" heading, up to an appendix. Page numbers and
 * short lines that repeat (running headers and footers) are dropped.
 */
export function extractReferences(pages: string[][]): ReferencesResult {
  const all = pages.flat();
  if (all.length === 0) return { ok: false, reason: 'no-text' };

  let start = -1;
  for (let i = all.length - 1; i >= 0; i--) {
    if (HEADING.test(all[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return { ok: false, reason: 'no-heading' };

  let body = all.slice(start + 1);
  // An appendix ends the list, but only after some entries (a heading right below is not the end).
  const end = body.findIndex((l, i) => i >= 3 && l.length < 60 && AFTER_LIST.test(l));
  if (end >= 0) body = body.slice(0, end);

  const seen = new Map<string, number>();
  for (const l of body) if (l.length < 80) seen.set(l, (seen.get(l) ?? 0) + 1);
  body = body.filter((l) => !PAGE_NUMBER.test(l) && !((seen.get(l) ?? 0) >= 3 && l.length < 80));

  return body.length ? { ok: true, text: body.join('\n'), lines: body.length } : { ok: false, reason: 'no-heading' };
}
