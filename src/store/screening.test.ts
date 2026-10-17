import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { prismaCounts, prismaMarkdown, screeningQueue } from './screening';

const papers = [
  makePaper({ id: 'a', title: 'A', sources: ['openalex', 'crossref'], screening: { decision: 'include' } }),
  makePaper({ id: 'b', title: 'B', sources: ['openalex'], screening: { decision: 'exclude', reason: 'テーマが違う' } }),
  makePaper({ id: 'c', title: 'C', sources: ['arxiv'], screening: { decision: 'exclude' } }),
  makePaper({ id: 'd', title: 'D', screening: { decision: 'maybe' } }),
  makePaper({ id: 'e', title: 'E', sources: ['openalex'] }),
];

describe('screening', () => {
  it('counts decisions, reasons and sources', () => {
    const c = prismaCounts(papers);
    expect(c).toMatchObject({ total: 5, screened: 4, pending: 1, included: 1, maybe: 1, excluded: 2 });
    expect(c.reasons).toEqual([['テーマが違う', 1], ['理由なし', 1]]);
    expect(c.bySource).toEqual([['openalex', 3], ['arxiv', 1], ['crossref', 1], ['manual', 1]]);
  });

  it('queues undecided papers first, then maybe', () => {
    expect(screeningQueue(papers).map((p) => p.id)).toEqual(['e', 'd', 'a', 'b', 'c']);
  });

  it('writes a PRISMA summary', () => {
    const md = prismaMarkdown(prismaCounts(papers));
    expect(md).toContain('- Records identified: 5 (openalex: 3, arxiv: 1, crossref: 1, manual: 1)');
    expect(md).toContain('  - テーマが違う: 1');
    expect(md).toContain('- Awaiting decision: 2 (maybe: 1)');
    expect(md).toContain('- Studies included: 1');
  });
});
