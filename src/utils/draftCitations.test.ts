import { describe, expect, it } from 'vitest';
import { bibEntryToPaper, citationKeys, parseBibtex, toBibtex } from '../../shared/biblio/bibtex';
import { makePaper } from '../../shared/paper';
import { checkDraft, editDistance, extractCitations, isLatex } from './draftCitations';

const attention = makePaper({ title: 'Attention Is All You Need', authors: ['Ashish Vaswani'], year: 2017, ids: { doi: '10.1/a' } });
const bert = makePaper({ title: 'BERT: Pre-training of Deep Bidirectional Transformers', authors: ['Jacob Devlin'], year: 2019, ids: { doi: '10.1/b' } });
const resnet = makePaper({ title: 'Deep Residual Learning', authors: ['Kaiming He'], year: 2016, ids: { doi: '10.1/c' } });
const keysOf = (text: string) => extractCitations(text).map((c) => c.key);

describe('extractCitations', () => {
  it('reads LaTeX citation commands with options and several keys', () => {
    const tex = [
      '\\section{Related work}',
      'Transformers~\\cite{vaswani2017attention, devlin2019bert} changed NLP',
      '\\citep[see][p.~3]{he2016deep} and \\textcite*{knuth1984}.',
      '\\cites[3]{a1}[5]{a2} \\nocite{*}',
      '% \\cite{commented}',
      '50\\% of \\autocite{last}',
    ].join('\n');
    expect(isLatex(tex)).toBe(true);
    expect(extractCitations(tex)).toEqual([
      { key: 'vaswani2017attention', line: 2 },
      { key: 'devlin2019bert', line: 2 },
      { key: 'he2016deep', line: 3 },
      { key: 'knuth1984', line: 3 },
      { key: 'a1', line: 4 },
      { key: 'a2', line: 4 },
      { key: 'last', line: 6 },
    ]);
  });

  it('reads keys split over lines', () => {
    expect(extractCitations('\\cite{a,\n  b}')).toEqual([
      { key: 'a', line: 1 },
      { key: 'b', line: 2 },
    ]);
  });

  it('reads Pandoc citations and skips e-mail addresses and code', () => {
    const md = [
      '# Intro',
      'As shown [@vaswani2017attention; see @he2016deep, p. 4], and @devlin2019bert argues.',
      'Write to me@example.com or see `@notakey`.',
      '```',
      '@decorator',
      '```',
      'Ends with @last.',
    ].join('\n');
    expect(isLatex(md)).toBe(false);
    expect(keysOf(md)).toEqual(['vaswani2017attention', 'he2016deep', 'devlin2019bert', 'last']);
  });
});

describe('checkDraft', () => {
  it('separates cited, unknown and uncited papers', () => {
    const papers = [attention, bert, resnet];
    const draft = 'See \\cite{vaswani2017attention} and \\cite{Vaswani2017Attention,devlin2019bret}.\n\\cite{nobody2020x}';
    const r = checkDraft(draft, papers);
    expect(r.uses).toBe(4);
    expect(r.cited.map((c) => [c.key, c.count, c.firstLine])).toEqual([['vaswani2017attention', 2, 1]]);
    expect(r.unknown.map((u) => u.key)).toEqual(['devlin2019bret', 'nobody2020x']);
    expect(r.unknown[0].suggestions.map((s) => s.key)).toEqual(['devlin2019bert']);
    expect(r.unknown[1].suggestions).toEqual([]);
    expect(r.uncited.map((u) => u.key)).toEqual(['devlin2019bert', 'he2016deep']);
  });

  it('uses keys kept from imported BibTeX', () => {
    const [imported] = parseBibtex('@article{Smith:2020, title={A Study of Things}, author={Smith, J.}, year={2020}}').map(bibEntryToPaper);
    expect(imported.citeKey).toBe('Smith:2020');
    const r = checkDraft('\\cite{Smith:2020}', [imported, attention]);
    expect(r.cited.map((c) => c.paper.id)).toEqual([imported.id]);
    // The cited subset keeps the draft's keys when exported.
    expect(toBibtex([imported], r.keys)).toContain('@misc{Smith:2020,');
  });

  it('measures edit distance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
  });
});

describe('citationKeys with kept keys', () => {
  it('keeps imported keys and avoids them when generating', () => {
    const kept = { ...bert, citeKey: 'vaswani2017attention' };
    const keys = citationKeys([attention, kept]);
    expect(keys.get(kept.id)).toBe('vaswani2017attention');
    expect(keys.get(attention.id)).toBe('vaswani2017attentiona');
    expect([...keys.keys()]).toEqual([attention.id, kept.id]);
  });
});
