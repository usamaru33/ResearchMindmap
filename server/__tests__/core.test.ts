import { describe, expect, it } from 'vitest';
import { arxivIdFromDoi, canonicalId, normalizeArxivId, normalizeDoi, normalizeOpenAlexId } from '../../shared/ids';
import { makePaper, plainText } from '../../shared/paper';
import type { Paper } from '../../shared/types';
import { mergePaperLists } from '../core/merge';
import { fuseRankedLists, rrfScores } from '../core/rank';

describe('identifier normalization', () => {
  it.each([
    ['https://doi.org/10.1145/3313831.3376358', '10.1145/3313831.3376358'],
    ['doi:10.1109/VR.2019.8798222.', '10.1109/vr.2019.8798222'],
    ['not a doi', undefined],
  ])('normalizeDoi(%s)', (input, out) => expect(normalizeDoi(input)).toBe(out));

  it.each([
    ['arXiv:1706.03762v7', '1706.03762'],
    ['https://arxiv.org/abs/2101.00001', '2101.00001'],
    ['hep-th/9901001v2', 'hep-th/9901001'],
  ])('normalizeArxivId(%s)', (input, out) => expect(normalizeArxivId(input)).toBe(out));

  it('normalizes OpenAlex ids and arXiv DOIs', () => {
    expect(normalizeOpenAlexId('https://openalex.org/W2626778328')).toBe('W2626778328');
    expect(arxivIdFromDoi('10.48550/arxiv.1706.03762')).toBe('1706.03762');
  });

  it('prefers DOI, then arXiv, then other ids, then title', () => {
    expect(canonicalId({ doi: '10.1/x', arxiv: '1' }, 'T', 2020)).toBe('doi:10.1/x');
    expect(canonicalId({ arxiv: '1706.03762', openalex: 'W1' }, 'T', 2020)).toBe('arxiv:1706.03762');
    expect(canonicalId({}, 'Attention Is All You Need!', 2017)).toBe('title:attention is all you need:2017');
  });

  it('strips markup from abstracts', () => {
    expect(plainText('<jats:p>Deep &amp; <i>wide</i>\n nets</jats:p>')).toBe('Deep & wide nets');
  });
});

const p = (title: string, extra: Partial<Paper> = {}) => makePaper({ title, year: 2020, ...extra });

describe('mergePaperLists', () => {
  it('merges records sharing a DOI and keeps the richest fields', () => {
    const a = p('Deep Residual Learning for Image Recognition', {
      ids: { doi: '10.1109/cvpr.2016.90' },
      sources: ['crossref'],
      citationCount: 10,
    });
    const b = p('Deep residual learning for image recognition', {
      ids: { doi: '10.1109/cvpr.2016.90', openalex: 'W1' },
      abstract: 'We present a residual learning framework...',
      sources: ['openalex'],
      citationCount: 200000,
    });
    const { papers } = mergePaperLists([[a], [b]]);
    expect(papers).toHaveLength(1);
    expect(papers[0]).toMatchObject({
      id: 'doi:10.1109/cvpr.2016.90',
      abstract: 'We present a residual learning framework...',
      citationCount: 200000,
      sources: ['crossref', 'openalex'],
      ids: { doi: '10.1109/cvpr.2016.90', openalex: 'W1' },
    });
  });

  it('merges a preprint with its published version by title and prefers the published venue', () => {
    const preprint = p('Attention Is All You Need', { ids: { arxiv: '1706.03762' }, venue: 'arXiv', year: 2017 });
    const published = p('Attention is all you need', { ids: { doi: '10.5555/3295222' }, venue: 'NeurIPS', year: 2017 });
    const { papers } = mergePaperLists([[preprint], [published]]);
    expect(papers).toHaveLength(1);
    expect(papers[0].venue).toBe('NeurIPS');
    expect(papers[0].ids).toMatchObject({ arxiv: '1706.03762', doi: '10.5555/3295222' });
    expect(papers[0].id).toBe('doi:10.5555/3295222');
  });

  it('keeps works with the same title but distant years apart', () => {
    const { papers } = mergePaperLists([[p('A Survey of Graph Neural Networks', { year: 2019 })], [p('A survey of graph neural networks', { year: 2023 })]]);
    expect(papers).toHaveLength(2);
  });

  it('does not merge on short generic titles', () => {
    const { papers } = mergePaperLists([[p('Introduction', { ids: { s2: '1' } })], [p('Introduction', { ids: { s2: '2' } })]]);
    expect(papers).toHaveLength(2);
  });

  it('prefers a non-uppercase title', () => {
    const { papers } = mergePaperLists([[p('GRAPH NEURAL NETWORKS IN PRACTICE', { ids: { doi: '10.1/x' } })], [p('Graph Neural Networks in Practice', { ids: { doi: '10.1/x' } })]]);
    expect(papers[0].title).toBe('Graph Neural Networks in Practice');
  });
});

describe('ranking', () => {
  it('computes reciprocal rank fusion scores', () => {
    const s = rrfScores([[0, 1], [1, 2]], 3, 60);
    expect(s[1]).toBeCloseTo(1 / 62 + 1 / 61);
    expect(s[1]).toBeGreaterThan(s[0]);
    expect(s[0]).toBeGreaterThan(s[2]);
  });

  it('ranks works found by several sources above single-source ones', () => {
    const shared = (src: Paper['sources']) => p('Shared Work About Virtual Reality Embodiment', { ids: { doi: '10.1/shared' }, sources: src });
    const lists = [
      [p('Only In Source One Somewhere Else', { ids: { doi: '10.1/one' } }), shared(['openalex'])],
      [shared(['crossref']), p('Only In Source Two Somewhere Else', { ids: { doi: '10.1/two' } })],
    ];
    const fused = fuseRankedLists(lists, { citationWeight: 0 });
    expect(fused[0].ids?.doi).toBe('10.1/shared');
    expect(fused[0].relevance).toBe(1);
    expect(fused).toHaveLength(3);
  });

  it('uses citation counts as a tie breaker', () => {
    const lists = [[p('First Paper With A Long Enough Title', { ids: { doi: '10.1/a' }, citationCount: 1 })], [p('Second Paper With A Long Enough Title', { ids: { doi: '10.1/b' }, citationCount: 5000 })]];
    expect(fuseRankedLists(lists)[0].ids?.doi).toBe('10.1/b');
  });
});
