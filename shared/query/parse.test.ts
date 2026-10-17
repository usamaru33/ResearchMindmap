import { describe, expect, it } from 'vitest';
import { formatQuery, parseQuery, type ParsedQuery, type QueryNode } from './index';

function ok(input: string): ParsedQuery {
  const r = parseQuery(input);
  if (!r.ok) throw new Error(`parse failed: ${JSON.stringify(r.errors)}`);
  return r.query;
}

function err(input: string) {
  const r = parseQuery(input);
  if (r.ok) throw new Error(`expected error for ${input}`);
  return r.errors[0];
}

const t = (value: string, field = 'all', phrase = false, wildcard = false): QueryNode => ({
  type: 'term',
  field: field as never,
  value,
  phrase,
  wildcard,
});

describe('parseQuery: basics', () => {
  it('treats adjacent words as AND and drops stop words', () => {
    expect(ok('deep learning for graphs').text).toEqual({
      type: 'and',
      children: [t('deep'), t('learning'), t('graphs')],
    });
  });

  it('parses phrases, including smart quotes', () => {
    expect(ok('"graph neural network"').text).toEqual(t('graph neural network', 'all', true));
    expect(ok('“body ownership”').text).toEqual(t('body ownership', 'all', true));
    expect(ok('"transformer"').text).toEqual(t('transformer'));
  });

  it('respects precedence NOT > AND > OR', () => {
    expect(ok('alpha OR beta AND NOT gamma').text).toEqual({
      type: 'or',
      children: [t('alpha'), { type: 'and', children: [t('beta'), { type: 'not', child: t('gamma') }] }],
    });
  });

  it('supports parentheses, && || and -term', () => {
    expect(ok('(vr || ar) && -survey').text).toEqual({
      type: 'and',
      children: [{ type: 'or', children: [t('vr'), t('ar')] }, { type: 'not', child: t('survey') }],
    });
  });

  it('keeps hyphenated words intact', () => {
    expect(ok('covid-19 self-supervised').text).toEqual({
      type: 'and',
      children: [t('covid-19'), t('self-supervised')],
    });
  });

  it('parses wildcards', () => {
    expect(ok('vir*').text).toEqual(t('vir', 'all', false, true));
    expect(ok('"virtual real*"').text).toEqual(t('virtual real', 'all', true, true));
  });

  it('lowercase and/or are plain (dropped) words', () => {
    expect(ok('haptics and vr').text).toEqual({ type: 'and', children: [t('haptics'), t('vr')] });
  });
});

describe('parseQuery: fields', () => {
  it('applies a field to the next primary only', () => {
    expect(ok('title:deep learning').text).toEqual({
      type: 'and',
      children: [t('deep', 'title'), t('learning')],
    });
  });

  it('applies a field to a group', () => {
    expect(ok('title:(alpha OR "beta gamma")').text).toEqual({
      type: 'or',
      children: [t('alpha', 'title'), t('beta gamma', 'title', true)],
    });
  });

  it('accepts IEEE Xplore syntax', () => {
    const q = ok('("Document Title":"virtual reality" AND "Author Keywords":haptics)');
    expect(q.text).toEqual({
      type: 'and',
      children: [t('virtual reality', 'title', true), t('haptics', 'keyword')],
    });
  });

  it('accepts ACM DL syntax', () => {
    const q = ok('Title:(embodiment) AND Abstract:("body ownership") AND AllField:(VR)');
    expect(q.text).toEqual({
      type: 'and',
      children: [t('embodiment', 'title'), t('body ownership', 'abstract', true), t('VR')],
    });
  });

  it('accepts Scopus syntax', () => {
    const q = ok('TITLE-ABS-KEY("virtual reality" AND avatar) AND PUBYEAR > 2019');
    expect(q.text).toEqual({
      type: 'and',
      children: [t('virtual reality', 'tiab', true), t('avatar', 'tiab')],
    });
    expect(q.filters.yearMin).toBe(2020);
  });

  it('accepts Web of Science TI= / AU= / PY=', () => {
    const q = ok('TI=(robot* NOT survey) AND AU=Hinton AND PY=2015-2020');
    expect(q.text).toEqual({
      type: 'and',
      children: [
        t('robot', 'title', false, true),
        { type: 'not', child: t('survey', 'title') },
        t('Hinton', 'author'),
      ],
    });
    expect(q.filters).toMatchObject({ yearMin: 2015, yearMax: 2020 });
  });

  it('accepts PubMed postfix tags', () => {
    const q = ok('("deep learning"[tiab] OR cnn[ti]) AND smith[au] AND 2018:2022[dp]');
    expect(q.text).toEqual({
      type: 'and',
      children: [
        { type: 'or', children: [t('deep learning', 'tiab', true), t('cnn', 'title')] },
        t('smith', 'author'),
      ],
    });
    expect(q.filters).toMatchObject({ yearMin: 2018, yearMax: 2022 });
  });

  it('warns about unknown tags and treats unknown prefixes as text', () => {
    const r = parseQuery('foo[zz] arXiv:2101.00001');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings[0].message).toContain('[zz]');
      expect(r.query.text).toEqual({ type: 'and', children: [t('foo'), t('arXiv:2101.00001')] });
    }
  });
});

describe('parseQuery: filters', () => {
  it.each([
    ['year:2020', { yearMin: 2020, yearMax: 2020 }],
    ['year:2019..2024', { yearMin: 2019, yearMax: 2024 }],
    ['year:2024-2019', { yearMin: 2019, yearMax: 2024 }],
    ['year:>=2021', { yearMin: 2021 }],
    ['year:<2010', { yearMax: 2009 }],
    ['year:2015..', { yearMin: 2015 }],
    ['year:-2020', { yearMax: 2020 }],
  ])('%s', (input, expected) => {
    expect(ok(`x ${input}`).filters).toMatchObject(expected);
  });

  it('collects publishers, types, oa and languages', () => {
    const q = ok('x publisher:(ACM OR ieee) type:article oa:true lang:en');
    expect(q.filters).toEqual({ publishers: ['acm', 'ieee'], types: ['article'], openAccess: true, languages: ['en'] });
  });

  it('unions repeated publisher filters', () => {
    expect(ok('x publisher:acm publisher:ieee').filters.publishers).toEqual(['acm', 'ieee']);
  });

  it('allows a filter-only query', () => {
    const q = ok('year:2020 publisher:acm');
    expect(q.text).toBeNull();
  });
});

describe('parseQuery: errors', () => {
  it.each([
    ['', '検索語を入力'],
    ['(alpha OR beta', '閉じていません'],
    ['alpha OR beta)', '「(」がありません'],
    ['"unterminated', '引用符'],
    ['alpha AND', 'AND の後'],
    ['OR alpha', 'OR'],
    ['NOT alpha', 'NOT だけ'],
    ['title:', 'フィールド名の後'],
    ['()', '空です'],
    ['x year:abc', '年の指定'],
    ['x year:2025..2020 year:2026', '範囲が空'],
    ['alpha OR year:2020', 'フィルタは'],
    ['x oa:maybe', 'oa:'],
  ])('%j → %s', (input, message) => {
    expect(err(input).message).toContain(message);
  });

  it('reports the error position', () => {
    const e = err('virtual AND (reality OR');
    expect(e.start).toBeGreaterThanOrEqual(0);
    expect(e.end).toBeGreaterThan(e.start);
  });
});

describe('formatQuery', () => {
  it.each([
    'title:"virtual reality" AND (embodiment OR "body ownership") year:2015..2024 publisher:ieee',
    'TITLE-ABS-KEY("virtual reality" AND avatar) AND PUBYEAR > 2019',
    '(alpha OR beta) AND NOT (gamma AND delta) oa:true',
    'vir* AND author:"Smith, J"',
  ])('round-trips %s', (input) => {
    const once = ok(input);
    const text = formatQuery(once);
    expect(ok(text)).toEqual(once);
  });

  it('produces canonical text', () => {
    expect(formatQuery(ok('TI=(alpha OR beta) PY=2020-2022 publisher:ACM'))).toBe(
      '(title:alpha OR title:beta) AND year:2020..2022 AND publisher:acm',
    );
  });
});
