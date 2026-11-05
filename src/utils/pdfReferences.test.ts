import { describe, expect, it } from 'vitest';
import { extractReferences, itemsToLines } from './pdfReferences';
import { splitReferences } from './referenceList';

describe('itemsToLines', () => {
  it('joins the items of a line and breaks where an item ends it', () => {
    const items = [{ str: 'Deep residual ' }, { str: 'learning', hasEOL: true }, { str: '  ' , hasEOL: true }, { str: 'CVPR, 2016.' }];
    expect(itemsToLines(items)).toEqual(['Deep residual learning', 'CVPR, 2016.']);
  });
});

describe('extractReferences', () => {
  const body = ['1 Introduction', 'Embodiment matters [1].', '2 Method', 'We ran a study.'];
  const refs = [
    '[1] M. Slater, “Body ownership,” Nature, 2009.',
    '[2] K. He, X. Zhang, S. Ren, and J. Sun, “Deep residual learning,” in CVPR, 2016.',
    '[3] A. Vaswani et al., “Attention is all you need,” in NeurIPS, 2017.',
  ];

  it('takes the lines after the last References heading', () => {
    const res = extractReferences([body, ['References', ...refs]]);
    expect(res).toEqual({ ok: true, text: refs.join('\n'), lines: 3 });
  });

  it('accepts numbered and upper-case headings and a heading before the real one', () => {
    for (const heading of ['7 References', 'VII. REFERENCES', 'Bibliography', '参考文献']) {
      const res = extractReferences([['References', 'see below'], [heading, ...refs]]);
      expect(res.ok && res.text).toBe(refs.join('\n'));
    }
  });

  it('stops at an appendix and drops page numbers and running headers', () => {
    const pages = [
      ['References', refs[0], 'Journal of Examples', '12'],
      ['Journal of Examples', refs[1], '13', 'Journal of Examples'],
      [refs[2], 'A Appendix', 'More tables'],
    ];
    const res = extractReferences(pages);
    expect(res.ok && res.text.split('\n')).toEqual(refs);
  });

  it('does not treat an appendix heading right under References as the end', () => {
    const res = extractReferences([['References', 'Appendix A. Proofs of the lemma are in [1].', ...refs]]);
    expect(res.ok && res.lines).toBe(4);
  });

  it('reports why nothing was found', () => {
    expect(extractReferences([[], []])).toEqual({ ok: false, reason: 'no-text' });
    expect(extractReferences([body])).toEqual({ ok: false, reason: 'no-heading' });
    expect(extractReferences([['References']])).toEqual({ ok: false, reason: 'no-heading' });
  });

  it('hands lines that splitReferences can split into one reference each', () => {
    const res = extractReferences([['References', ...refs]]);
    expect(res.ok && splitReferences(res.text)).toHaveLength(3);
  });
});
