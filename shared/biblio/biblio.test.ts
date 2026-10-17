import { describe, expect, it } from 'vitest';
import { makePaper } from '../paper';
import { bibEntryToPaper, citationKeys, parseBibtex, toBibtex } from './bibtex';
import { formatCitation, toCsv } from './formats';
import { initials, parseName } from './names';
import { parseRis, toRis } from './ris';

const attention = makePaper({
  title: 'Attention Is All You Need',
  authors: ['Ashish Vaswani', 'Shazeer, Noam', 'N. Parmar'],
  year: 2017,
  venue: 'Advances in Neural Information Processing Systems',
  type: 'proceedings-article',
  ids: { arxiv: '1706.03762' },
  abstract: 'We propose the Transformer & more: 100% attention_based.',
  tags: ['nlp'],
});
const resnet = makePaper({
  title: 'Deep Residual Learning for Image Recognition',
  authors: ['Kaiming He', 'Xiangyu Zhang', 'Shaoqing Ren', 'Jian Sun'],
  year: 2016,
  venue: 'IEEE Conference on Computer Vision and Pattern Recognition',
  type: 'proceedings-article',
  ids: { doi: '10.1109/cvpr.2016.90' },
});
const article = makePaper({
  title: 'The Sense of Embodiment in Virtual Reality',
  authors: ['Konstantina Kilteni', 'Raphaela Groten', 'Mel Slater'],
  year: 2012,
  venue: 'Presence',
  type: 'journal-article',
  ids: { doi: '10.1162/pres_a_00124' },
});

describe('names', () => {
  it.each([
    ['Vaswani, A.', { family: 'Vaswani', given: 'A.' }],
    ['Ashish Vaswani', { family: 'Vaswani', given: 'Ashish' }],
    ['Ludwig van Beethoven', { family: 'van Beethoven', given: 'Ludwig' }],
    ['Plato', { family: 'Plato', given: '' }],
  ])('parseName(%s)', (raw, expected) => expect(parseName(raw)).toEqual(expected));

  it('abbreviates given names', () => {
    expect(initials('Ashish Nagaraj')).toBe('A. N.');
    expect(initials('Jean-Pierre')).toBe('J.-P.');
    expect(initials('A. N.')).toBe('A. N.');
  });
});

describe('BibTeX', () => {
  it('builds readable, unique citation keys', () => {
    const twin = { ...attention, id: 'other', title: 'Attention Revisited' };
    const keys = citationKeys([attention, twin, resnet]);
    expect([...keys.values()]).toEqual(['vaswani2017attention', 'vaswani2017attentiona', 'he2016deep']);
  });

  it('writes entries with escaped fields', () => {
    const bib = toBibtex([attention]);
    expect(bib).toContain('@inproceedings{vaswani2017attention,');
    expect(bib).toContain('title = {{Attention Is All You Need}}');
    expect(bib).toContain('author = {Vaswani, Ashish and Shazeer, Noam and Parmar, N.}');
    expect(bib).toContain('booktitle = {Advances in Neural Information Processing Systems}');
    expect(bib).toContain('eprint = {1706.03762}');
    expect(bib).toContain('Transformer \\& more: 100\\% attention\\_based.');
  });

  it('round-trips through export and import', () => {
    const back = parseBibtex(toBibtex([attention, resnet, article])).map(bibEntryToPaper);
    expect(back.map((p) => [p.title, p.year, p.venue, p.ids?.doi, p.ids?.arxiv])).toEqual([
      ['Attention Is All You Need', 2017, 'Advances in Neural Information Processing Systems', undefined, '1706.03762'],
      ['Deep Residual Learning for Image Recognition', 2016, 'IEEE Conference on Computer Vision and Pattern Recognition', '10.1109/cvpr.2016.90', undefined],
      ['The Sense of Embodiment in Virtual Reality', 2012, 'Presence', '10.1162/pres_a_00124', undefined],
    ]);
    expect(back[0].authors).toEqual(['Ashish Vaswani', 'Noam Shazeer', 'N. Parmar']);
    expect(back[0].abstract).toBe(attention.abstract);
    expect(back[1].type).toBe('proceedings-article');
    expect(back[2].type).toBe('journal-article');
  });

  it('reads hand-written BibTeX: quotes, numbers, accents, comments', () => {
    const text = `
      @comment{ignore me {nested}}
      @Article{key1,
        title = "Caf{\\'e} {Culture} in {VR}",
        author = {M{\\"u}ller, Jan and Doe, J.},
        year = 2020,
        journal = {Journal of Tests},
        doi = {https://doi.org/10.1234/ABC}
      }
      @misc{key2, title={Only a title}}
    `;
    const [a, b] = parseBibtex(text).map(bibEntryToPaper);
    expect(a).toMatchObject({ title: 'Cafe Culture in VR', year: 2020, venue: 'Journal of Tests', ids: { doi: '10.1234/abc' } });
    expect(a.authors).toEqual(['Jan Muller', 'J. Doe']);
    expect(b.title).toBe('Only a title');
  });
});

describe('RIS', () => {
  it('round-trips through export and import', () => {
    const back = parseRis(toRis([resnet, article]));
    expect(back.map((p) => [p.title, p.year, p.venue, p.ids?.doi, p.type])).toEqual([
      ['Deep Residual Learning for Image Recognition', 2016, 'IEEE Conference on Computer Vision and Pattern Recognition', '10.1109/cvpr.2016.90', 'proceedings-article'],
      ['The Sense of Embodiment in Virtual Reality', 2012, 'Presence', '10.1162/pres_a_00124', 'journal-article'],
    ]);
    expect(back[0].authors).toEqual(['Kaiming He', 'Xiangyu Zhang', 'Shaoqing Ren', 'Jian Sun']);
  });
});

describe('citation styles', () => {
  it('formats APA', () => {
    expect(formatCitation(article, 'apa')).toBe(
      'Kilteni, K., Groten, R., & Slater, M. (2012). The Sense of Embodiment in Virtual Reality. Presence. https://doi.org/10.1162/pres_a_00124',
    );
  });

  it('formats IEEE, with "in" for proceedings', () => {
    expect(formatCitation(resnet, 'ieee')).toBe(
      'K. He, X. Zhang, S. Ren, and J. Sun, “Deep Residual Learning for Image Recognition,” in IEEE Conference on Computer Vision and Pattern Recognition, 2016, doi: 10.1109/cvpr.2016.90.',
    );
  });

  it('formats ACM', () => {
    expect(formatCitation(attention, 'acm')).toBe(
      'Ashish Vaswani, Noam Shazeer, and N. Parmar. 2017. Attention Is All You Need. In Advances in Neural Information Processing Systems. https://arxiv.org/abs/1706.03762',
    );
  });

  it('uses et al. for long IEEE author lists', () => {
    const many = { ...resnet, authors: ['A B', 'C D', 'E F', 'G H', 'I J', 'K L', 'M N'] };
    expect(formatCitation(many, 'ieee')).toMatch(/^A\. B et al\., “/);
  });
});

describe('CSV', () => {
  it('quotes cells with commas, quotes and newlines and starts with a BOM', () => {
    const csv = toCsv([{ ...article, notes: 'says "wow", then\nmore' }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"says ""wow"", then\nmore"');
    expect(csv.split('\r\n')[0]).toBe('﻿title,authors,year,venue,doi,arxiv,url,citations,status,rating,tags,notes,abstract');
  });
});
