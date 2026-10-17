import { normalizeArxivId, normalizeDoi } from '../ids';
import { makePaper } from '../paper';
import { publisherFromDoi } from '../query';
import type { Paper } from '../types';
import { parseName } from './names';

function risType(p: Paper): string {
  const t = (p.type ?? '').toLowerCase();
  if (t.includes('proceedings') || t.includes('conference')) return 'CPAPER';
  if (t === 'book') return 'BOOK';
  if (t.includes('chapter')) return 'CHAP';
  if (t === 'preprint') return 'UNPB';
  return 'JOUR';
}

export function toRis(papers: Paper[]): string {
  return (
    papers
      .map((p) => {
        const lines: string[] = [`TY  - ${risType(p)}`, `TI  - ${p.title}`];
        for (const a of p.authors) {
          const n = parseName(a);
          lines.push(`AU  - ${n.given ? `${n.family}, ${n.given}` : n.family}`);
        }
        if (p.year) lines.push(`PY  - ${p.year}`);
        if (p.venue) lines.push(`${risType(p) === 'CPAPER' ? 'T2' : 'JO'}  - ${p.venue}`);
        if (p.ids?.doi) lines.push(`DO  - ${p.ids.doi}`);
        if (p.url) lines.push(`UR  - ${p.url}`);
        if (p.abstract) lines.push(`AB  - ${p.abstract.replace(/\s+/g, ' ')}`);
        for (const k of [...(p.tags ?? []), ...(p.keywords ?? [])]) lines.push(`KW  - ${k}`);
        if (p.notes) lines.push(`N1  - ${p.notes.replace(/\s+/g, ' ')}`);
        lines.push('ER  - ');
        return lines.join('\r\n');
      })
      .join('\r\n\r\n') + '\r\n'
  );
}

export function parseRis(text: string): Paper[] {
  const papers: Paper[] = [];
  let cur: Record<string, string[]> | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9]) {2}-\s?(.*)$/.exec(raw);
    if (!m) continue;
    const [, tag, value] = m;
    if (tag === 'TY') {
      cur = { TY: [value.trim()] };
      continue;
    }
    if (!cur) continue;
    if (tag === 'ER') {
      papers.push(risRecordToPaper(cur));
      cur = null;
      continue;
    }
    (cur[tag] ??= []).push(value.trim());
  }
  return papers;
}

function risRecordToPaper(r: Record<string, string[]>): Paper {
  const first = (...tags: string[]) => tags.map((t) => r[t]?.[0]).find(Boolean);
  const doi = normalizeDoi(first('DO') ?? '');
  const url = first('UR');
  const arxiv = url && /arxiv\.org/i.test(url) ? normalizeArxivId(url) : undefined;
  const type = r.TY?.[0];
  return makePaper({
    title: first('TI', 'T1') ?? '(untitled)',
    authors: [...(r.AU ?? []), ...(r.A1 ?? [])].map((a) => {
      const n = parseName(a);
      return n.given ? `${n.given} ${n.family}` : n.family;
    }),
    year: Number((first('PY', 'Y1', 'DA') ?? '').slice(0, 4)) || 0,
    venue: first('JO', 'T2', 'JF', 'BT') ?? '',
    abstract: first('AB', 'N2') ?? '',
    notes: first('N1'),
    keywords: r.KW,
    ids: { doi, arxiv },
    url,
    publisher: publisherFromDoi(doi),
    type: type === 'CPAPER' || type === 'CONF' ? 'proceedings-article' : type === 'JOUR' ? 'journal-article' : type === 'UNPB' ? 'preprint' : type?.toLowerCase(),
  });
}
