import { describe, expect, it } from 'vitest';
import { MESSAGES, detectLang, format, makeTranslate } from '.';

describe('format', () => {
  it('fills placeholders and picks plural words', () => {
    expect(format('{n} {n|paper|papers}', { n: 1 })).toBe('1 paper');
    expect(format('{n} {n|paper|papers}', { n: 3 })).toBe('3 papers');
    expect(format('Hello {name}', { name: 'Ada' })).toBe('Hello Ada');
    expect(format('Hello {name}')).toBe('Hello {name}');
  });
});

describe('translations', () => {
  it('switches language', () => {
    expect(makeTranslate('ja')('toolbar.search')).toBe('検索');
    expect(makeTranslate('en')('toolbar.search')).toBe('Search');
  });

  it('has both languages for every key, with the same placeholders', () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();
    for (const [key, [ja, en]] of Object.entries(MESSAGES)) {
      expect(ja.trim(), key).not.toBe('');
      expect(en.trim(), key).not.toBe('');
      expect([...new Set(names(ja))], key).toEqual([...new Set(names(en))]);
    }
  });

  it('detects the browser language', () => {
    expect(detectLang(['ja-JP'])).toBe('ja');
    expect(detectLang(['en-GB'])).toBe('en');
    expect(detectLang([])).toBe('ja');
  });
});
