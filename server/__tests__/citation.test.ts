import { describe, expect, it } from 'vitest';
import { makePaper } from '../../shared/paper';
import { bestMatch, citationYears, looksLikeCitation, scoreCandidate, titleGuesses } from '../core/citation';
import { parseIdentifier, resolveIdentifier } from '../core/resolve';
import { HttpClient } from '../infra/http';

const IEEE = 'A. Vaswani, N. Shazeer, N. Parmar et al., “Attention is all you need,” in Proc. NeurIPS, 2017, pp. 5998–6008.';
const APA = 'He, K., Zhang, X., Ren, S., & Sun, J. (2016). Deep residual learning for image recognition. In Proceedings of CVPR (pp. 770-778).';
const ACM = 'Mel Slater, Bernhard Spanlang, Maria V. Sanchez-Vives, and Olaf Blanke. 2010. First person experience of body transfer in virtual reality. PLoS ONE 5, 5 (2010), e10564.';
const VANCOUVER = 'Botvinick M, Cohen J. Rubber hands feel touch that eyes see. Nature. 1998;391(6669):756.';

describe('reading references', () => {
  it('tells references from titles and ids', () => {
    expect(looksLikeCitation(IEEE)).toBe(true);
    expect(looksLikeCitation('Deep Residual Learning for Image Recognition')).toBe(false);
    expect(parseIdentifier(`[4] ${APA}`)).toEqual({ kind: 'citation', value: APA });
    expect(parseIdentifier('J. Devlin et al., "BERT," arXiv:1810.04805, 2018.')).toEqual({ kind: 'arxiv', value: '1810.04805' });
  });

  it('finds years', () => {
    expect(citationYears(VANCOUVER)).toEqual([1998]);
    expect(citationYears('Smith (2020a), vol. 12, 2019–2021')).toEqual([2020, 2019, 2021]);
  });

  it.each([
    [IEEE, 'Attention is all you need'],
    [APA, 'Deep residual learning for image recognition'],
    [ACM, 'First person experience of body transfer in virtual reality'],
    [VANCOUVER, 'Rubber hands feel touch that eyes see'],
  ])('guesses the title of %s', (citation, title) => expect(titleGuesses(citation)[0]).toBe(title));
});

describe('scoring candidates', () => {
  const paper = (title: string, year: number, author: string, citationCount = 0) => makePaper({ title, year, authors: [author], citationCount });

  it('needs the title, and the year or first author, to fit', () => {
    expect(scoreCandidate(APA, paper('Deep Residual Learning for Image Recognition', 2016, 'Kaiming He')).confidence).toBe('high');
    // Same title, but the catalogue dates it 2025: still offered, for the user to confirm.
    expect(scoreCandidate(IEEE, paper('Attention Is All You Need', 2025, 'Ashish Vaswani')).confidence).toBe('low');
    expect(scoreCandidate(IEEE, paper('Attention Is All You Need', 2025, 'Someone Else')).confidence).toBeNull();
    expect(scoreCandidate(APA, paper('Deep Learning', 2016, 'Kaiming He')).confidence).toBeNull();
    expect(scoreCandidate(APA, paper('Deep residual learning for image recognition: a survey', 2022, 'Shafiq')).confidence).toBeNull();
  });

  it('prefers confident matches, then coverage, then citations', () => {
    const best = bestMatch(IEEE, [
      paper('Attention Is All You Need', 2025, 'Ashish Vaswani', 78000),
      paper('Attention Is All You Need', 2017, 'Ashish Vaswani', 10),
      paper('Attention Is All You Need In Speech Separation', 2021, 'Cem Subakan', 700),
    ]);
    expect(best?.paper.year).toBe(2017);
  });
});

function http(routes: Array<[RegExp, unknown]>) {
  const calls: string[] = [];
  return {
    calls,
    http: new HttpClient({
      log: () => {},
      sleep: async () => {},
      fetch: (async (input: string | URL | Request) => {
        const url = decodeURIComponent(String(input)).replace(/\+/g, ' ');
        calls.push(url);
        const hit = routes.find(([re]) => re.test(url));
        return new Response(JSON.stringify(hit ? hit[1] : { error: 'nf' }), { status: hit ? 200 : 404, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch,
    }),
  };
}

const oaWork = (id: string, title: string, year: number, author: string, extra: object = {}) => ({
  id: `https://openalex.org/${id}`,
  title,
  publication_year: year,
  cited_by_count: 5,
  authorships: [{ author: { display_name: author } }],
  ...extra,
});

describe('resolving references', () => {
  it('searches OpenAlex by the guessed title and reports confidence', async () => {
    const { http: h, calls } = http([[/search\.title=Deep residual learning/, { results: [oaWork('W1', 'Deep Residual Learning for Image Recognition', 2016, 'Kaiming He')] }]]);
    const r = await resolveIdentifier(APA, { http: h });
    expect(r).toMatchObject({ ok: true, kind: 'citation', confidence: 'high', paper: { ids: { openalex: 'W1' } } });
    expect(calls).toHaveLength(1);
  });

  it('falls back to Crossref and then enriches from OpenAlex by DOI', async () => {
    const { http: h, calls } = http([
      [/search\.title=/, { results: [] }],
      [/query\.bibliographic=/, { message: { items: [{ DOI: '10.1038/35784', title: ['Rubber hands ‘feel’ touch that eyes see'], issued: { 'date-parts': [[1998]] }, author: [{ given: 'Matthew', family: 'Botvinick' }] }] } }],
      [/works\/doi:10\.1038\/35784/, oaWork('W9', 'Rubber hands ‘feel’ touch that eyes see', 1998, 'Matthew Botvinick', { cited_by_count: 4407 })],
    ]);
    const r = await resolveIdentifier(VANCOUVER, { http: h });
    expect(r).toMatchObject({ ok: true, confidence: 'high', paper: { citationCount: 4407, ids: { openalex: 'W9' } } });
    expect(calls.some((c) => c.includes('api.crossref.org'))).toBe(true);
  });

  it('does not trust an id record that contradicts the reference', async () => {
    const citation = 'J. Devlin, M.-W. Chang, K. Lee, and K. Toutanova, "BERT: Pre-training of deep bidirectional transformers for language understanding," arXiv:1810.04805, 2018.';
    const feed = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/1810.04805v2</id><title>BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding</title><published>2018-10-11T00:00:00Z</published><author><name>Jacob Devlin</name></author><summary>x</summary></entry></feed>`;
    const h = new HttpClient({
      log: () => {},
      sleep: async () => {},
      fetch: (async (input: string | URL | Request) => {
        const url = decodeURIComponent(String(input));
        if (url.includes('export.arxiv.org')) return new Response(feed, { status: 200, headers: { 'content-type': 'application/atom+xml' } });
        // The catalogue record for this DOI carries another paper's title.
        return new Response(JSON.stringify(oaWork('W2896457183', 'AI-Assisted Pipeline for Dynamic Generation of Content', 2018, 'Someone')), { status: 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch,
    });
    const r = await resolveIdentifier(citation, { http: h });
    expect(r).toMatchObject({ ok: true, kind: 'arxiv', paper: { title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding' } });
  });

  it('reports references it cannot match', async () => {
    const { http: h } = http([
      [/search\.title=/, { results: [oaWork('W5', 'Medieval Nonsense', 2021, 'Someone')] }],
      [/query\.bibliographic=/, { message: { items: [] } }],
    ]);
    const r = await resolveIdentifier('Smith J. A totally made up paper about nothing whatsoever at all. Journal of Nonsense. 2021;3:1-2.', { http: h });
    expect(r).toMatchObject({ ok: false, kind: 'citation' });
  });
});
